//! Pixel cells and the shared rectangular tile engine used by Mosaic.
use super::{
    compose::FrameComposer,
    contract::{Family, StyleSettings},
    geometry::FrameGeometry,
    sampling::AreaSampler,
    StyleFrame,
};
use crate::{
    character::{JobStatus, RenderError, MAX_SOURCE_BYTES},
    reference_characters::source_identity,
    source::SourceImage,
};

#[derive(Debug)]
pub struct PixelJob {
    pub(crate) tiles: TileJob,
}

#[derive(Debug)]
pub(crate) struct TileJob {
    context: crate::style_context::StyleContext,
    settings: StyleSettings,
    geometry: FrameGeometry,
    identity: (usize, u32, u32, usize, usize),
    composer: FrameComposer,
    sampler: Option<AreaSampler>,
    tile_x: usize,
    tile_y: usize,
    paint_x: usize,
    paint_y: usize,
    color: [u8; 4],
    painting: bool,
    done: bool,
    cancelled: bool,
    multiplier_x: usize,
    multiplier_y: usize,
}
fn byte(v: f64) -> u8 {
    (v.clamp(0., 255.) + 0.5).floor() as u8
}
impl TileJob {
    pub(crate) fn peak(
        source: &SourceImage,
        s: &StyleSettings,
        other: usize,
    ) -> Result<usize, RenderError> {
        FrameGeometry::new(source, s)?;
        let bytes = (s.width as usize)
            .checked_mul(s.height as usize)
            .and_then(|n| n.checked_mul(4))
            .ok_or(RenderError::BudgetExceeded)?;
        let job_extra = std::mem::size_of::<super::StyleJob>()
            .checked_sub(std::mem::size_of::<FrameComposer>())
            .ok_or(RenderError::BudgetExceeded)?;
        FrameComposer::estimated_peak_bytes(source, s, bytes, other)?
            .checked_add(job_extra)
            .and_then(|n| n.checked_add(16))
            .ok_or(RenderError::BudgetExceeded)
    }
    pub(crate) fn new(
        source: &SourceImage,
        s: StyleSettings,
        other: usize,
    ) -> Result<Self, RenderError> {
        let peak = Self::peak(source, &s, other)?;
        if peak > source.budget().min(MAX_SOURCE_BYTES) {
            return Err(RenderError::BudgetExceeded);
        }
        let geometry = FrameGeometry::new(source, &s)?;
        let n = s.width as usize * s.height as usize * 4;
        let mut layer = Vec::new();
        layer
            .try_reserve_exact(n)
            .map_err(|_| RenderError::BudgetExceeded)?;
        layer.resize(n, 0);
        if peak
            .checked_add(layer.capacity() - n)
            .is_none_or(|v| v > source.budget().min(MAX_SOURCE_BYTES))
        {
            return Err(RenderError::BudgetExceeded);
        }
        let job_extra = std::mem::size_of::<super::StyleJob>()
            .checked_sub(std::mem::size_of::<FrameComposer>())
            .ok_or(RenderError::BudgetExceeded)?;
        let composer_other = other
            .checked_add(job_extra)
            .and_then(|n| n.checked_add(16))
            .ok_or(RenderError::BudgetExceeded)?;
        let composer = FrameComposer::new(source, s.clone(), layer, composer_other)?;
        let (multiplier_x, multiplier_y) = match s.family {
            Family::Pixel => (1, 1),
            Family::Mosaic { shape: 1 } => (2, 1),
            Family::Mosaic { shape: 2 } => (1, 2),
            Family::Mosaic { shape: 0 } => (1, 1),
            _ => return Err(RenderError::UnsupportedVersion),
        };
        Ok(Self {
            context: crate::style_context::StyleContext::default(),
            settings: s,
            geometry,
            identity: source_identity(source),
            composer,
            sampler: None,
            tile_x: 0,
            tile_y: 0,
            paint_x: 0,
            paint_y: 0,
            color: [0; 4],
            painting: false,
            done: false,
            cancelled: false,
            multiplier_x,
            multiplier_y,
        })
    }
    pub(crate) fn configure_context(&mut self, c: crate::style_context::StyleContext) {
        self.context = c;
        self.composer.configure_context(c);
    }
    fn tile_bounds(&self) -> [f64; 4] {
        let s = &self.settings;
        let pitch_x = 3. * s.font_size as f64 * s.scale as f64 / 5.;
        let pitch_y = s.font_size as f64 * s.scale as f64;
        let x0 = (self.tile_x * self.multiplier_x) as f64 * pitch_x;
        let y0 = (self.tile_y * self.multiplier_y) as f64 * pitch_y;
        [
            x0,
            y0,
            ((self.tile_x + 1) * self.multiplier_x) as f64 * pitch_x,
            ((self.tile_y + 1) * self.multiplier_y) as f64 * pitch_y,
        ]
    }
    fn clipped_bounds(&self) -> [f64; 4] {
        let mut b = self.tile_bounds();
        b[2] = b[2].min(self.settings.width as f64);
        b[3] = b[3].min(self.settings.height as f64);
        b
    }
    fn paint_bounds(&self) -> [f64; 4] {
        if !matches!(self.settings.family, Family::Pixel) {
            return self.clipped_bounds();
        }
        let mut b = self.tile_bounds();
        b[0] += 0.5;
        b[1] += 0.5;
        b[2] = (b[2] - 0.5).min(self.settings.width as f64);
        b[3] = (b[3] - 0.5).min(self.settings.height as f64);
        b
    }
    fn paint_start(&self, edge: f64) -> usize {
        if matches!(self.settings.family, Family::Pixel) {
            edge.floor().max(0.) as usize
        } else {
            (edge - 0.5).ceil().max(0.) as usize
        }
    }
    fn advance(&mut self) {
        let pitch_x = 3. * self.settings.font_size as f64 * self.settings.scale as f64 / 5.;
        let pitch_y = self.settings.font_size as f64 * self.settings.scale as f64;
        self.tile_x += 1;
        if (self.tile_x * self.multiplier_x) as f64 * pitch_x >= self.settings.width as f64 {
            self.tile_x = 0;
            self.tile_y += 1;
        }
        if (self.tile_y * self.multiplier_y) as f64 * pitch_y >= self.settings.height as f64 {
            self.done = true;
        }
    }
    fn finish_sample(&mut self) {
        let sample = self.sampler.as_ref().unwrap().sample();
        let k = 259. * (self.settings.contrast + 255.) / (255. * (259. - self.settings.contrast));
        for i in 0..3 {
            let mut tone =
                (k * (sample.rgb[i] - 128.) + 128. + 255. * self.settings.brightness / 100.)
                    .clamp(0., 255.);
            if self.settings.invert {
                tone = 255. - tone;
            }
            if matches!(self.settings.family, Family::Pixel) {
                tone = 51. * (tone / 51. + 0.5).floor();
            }
            self.color[i] = byte(tone);
        }
        // Reference ink uses layer opacity; source alpha only normalizes sampled RGB.
        let alpha = if matches!(self.settings.family, Family::Pixel) {
            255.
        } else {
            sample.alpha
        };
        self.color[3] = byte(alpha * self.settings.opacity / 100.);
        if !self.context.occupied(self.tile_x, self.tile_y) {
            self.color[3] = 0;
        }
        if self.color[3] == 0 {
            self.color = [0; 4];
        }
        let b = self.paint_bounds();
        self.paint_x = self.paint_start(b[0]);
        self.paint_y = self.paint_start(b[1]);
        self.sampler = None;
        self.painting = true;
    }
    fn paint_one(&mut self) {
        let b = self.paint_bounds();
        let inset = matches!(self.settings.family, Family::Pixel);
        let offset = if inset { 0. } else { 0.5 };
        let x_end = (b[2] - offset).ceil().min(self.settings.width as f64) as usize;
        let y_end = (b[3] - offset).ceil().min(self.settings.height as f64) as usize;
        if self.paint_x >= x_end || self.paint_y >= y_end {
            self.painting = false;
            self.advance();
            return;
        }
        let i = (self.paint_y * self.settings.width as usize + self.paint_x) * 4;
        let mut color = self.color;
        if inset {
            let x = self.paint_x as f64;
            let y = self.paint_y as f64;
            let coverage =
                (b[2].min(x + 1.) - b[0].max(x)).max(0.) * (b[3].min(y + 1.) - b[1].max(y)).max(0.);
            color[3] = byte(color[3] as f64 * coverage + 1e-10);
            if color[3] == 0 {
                color = [0; 4];
            }
        }
        self.composer.layer_mut()[i..i + 4].copy_from_slice(&color);
        self.paint_x += 1;
        if self.paint_x >= x_end {
            self.paint_x = self.paint_start(b[0]);
            self.paint_y += 1;
        }
    }
    pub(crate) fn step(
        &mut self,
        source: &SourceImage,
        work: u32,
    ) -> Result<JobStatus, RenderError> {
        if self.cancelled {
            return Ok(JobStatus::Cancelled);
        }
        if self.done {
            return self.composer.step(source, work);
        }
        if work == 0 {
            return Ok(JobStatus::Pending);
        }
        if source_identity(source) != self.identity {
            self.cancel();
            return Err(RenderError::MissingSource);
        }
        let mut remaining = work;
        while remaining > 0 && !self.done {
            if self.painting {
                self.paint_one();
                remaining -= 1;
                continue;
            }
            if self.sampler.is_none() {
                let mut b = self.clipped_bounds();
                let scale = self.settings.scale as f64;
                if matches!(self.settings.family, Family::Pixel) {
                    let full = self.tile_bounds();
                    let (w, h) = self.geometry.extent();
                    let x = ((full[0] + full[2]) / (2. * scale))
                        .floor()
                        .min((w - 1) as f64);
                    let y = ((full[1] + full[3]) / (2. * scale))
                        .floor()
                        .min((h - 1) as f64);
                    b = [x * scale, y * scale, (x + 1.) * scale, (y + 1.) * scale];
                }
                let mut a =
                    AreaSampler::new(b[0] / scale, b[1] / scale, b[2] / scale, b[3] / scale)?;
                a.begin(&self.geometry);
                self.sampler = Some(a);
            }
            let status = self.sampler.as_mut().unwrap().step(
                source,
                &self.geometry,
                self.settings.rotation,
                1,
            )?;
            remaining -= 1;
            if status == JobStatus::Complete {
                self.finish_sample();
            }
        }
        if self.done && remaining > 0 {
            return self.composer.step(source, remaining);
        }
        Ok(JobStatus::Pending)
    }
    pub(crate) fn storage_bytes(&self) -> usize {
        self.composer.storage_bytes()
    }
    pub(crate) fn status(&self) -> JobStatus {
        if self.cancelled {
            JobStatus::Cancelled
        } else {
            if self.done {
                self.composer.status()
            } else {
                JobStatus::Pending
            }
        }
    }
    pub(crate) fn capacity_excess_bytes(&self) -> usize {
        self.composer.capacity_excess_bytes()
    }
    pub(crate) fn cancel(&mut self) {
        self.cancelled = true;
        self.sampler = None;
        self.composer.cancel();
    }
    pub(crate) fn take_frame(&mut self) -> Option<StyleFrame> {
        self.composer.take_frame()
    }
}
impl PixelJob {
    pub fn new(source: &SourceImage, s: StyleSettings, other: usize) -> Result<Self, RenderError> {
        if !matches!(s.family, Family::Pixel) {
            return Err(RenderError::InvalidInput);
        }
        Ok(Self {
            tiles: TileJob::new(source, s, other)?,
        })
    }
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        s: &StyleSettings,
        other: usize,
    ) -> Result<usize, RenderError> {
        if !matches!(s.family, Family::Pixel) {
            return Err(RenderError::InvalidInput);
        }
        TileJob::peak(source, s, other)
    }
    pub fn step(&mut self, source: &SourceImage, max_work: u32) -> Result<JobStatus, RenderError> {
        self.tiles.step(source, max_work)
    }
    pub fn status(&self) -> JobStatus {
        self.tiles.status()
    }
    pub fn storage_bytes(&self) -> usize {
        self.tiles.storage_bytes()
    }
    pub fn cancel(&mut self) {
        self.tiles.cancel()
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        self.tiles.take_frame()
    }
}

#[cfg(test)]
mod parity_tests {
    use super::*;
    use crate::character::Crop;
    use crate::styles::StyleJob;
    fn settings(family: Family, w: u32, h: u32, scale: u32) -> StyleSettings {
        StyleSettings {
            family,
            width: w,
            height: h,
            scale,
            rotation: 0,
            seed: 0,
            time_us: 0.,
            crop: Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            atlas_count: 0,
            atlas_origin_x: 0.,
            atlas_origin_y: 0.,
            space_index: 65535,
            font_size: 5,
            brightness: 0.,
            contrast: 0.,
            invert: false,
            opacity: 100.,
        }
    }
    fn source(w: u32, h: u32, pixels: Vec<u8>) -> SourceImage {
        SourceImage::new(w, h, pixels, MAX_SOURCE_BYTES).unwrap()
    }
    fn pixel(rgba: &[u8], w: usize, x: usize, y: usize) -> [u8; 4] {
        rgba[(y * w + x) * 4..(y * w + x) * 4 + 4]
            .try_into()
            .unwrap()
    }

    fn render_transparent(src: &SourceImage, s: StyleSettings, work: u32) -> Vec<u8> {
        let mut j = StyleJob::new(src, s, None, 0).unwrap();
        j.configure_context(crate::style_context::StyleContext {
            backdrop: 0,
            ..Default::default()
        });
        while j.step(src, None, work).unwrap() == JobStatus::Pending {}
        j.take_frame().unwrap().rgba
    }

    #[test]
    fn pixel_inset_keeps_six_tenths_pitch_with_fractional_edge_coverage() {
        let src = source(20, 22, [255, 255, 255, 255].repeat(20 * 22));
        let mut s = settings(Family::Pixel, 20, 22, 1);
        s.font_size = 11;
        let out = render_transparent(&src, s, 1);
        assert_eq!(pixel(&out, 20, 0, 0), [255, 255, 255, 64]);
        assert_eq!(pixel(&out, 20, 1, 1), [255, 255, 255, 255]);
        assert_eq!(pixel(&out, 20, 6, 1)[3], 26); // right edge at 6.1
        assert_eq!(pixel(&out, 20, 7, 1)[3], 230); // next cell starts at 7.1
        assert_eq!(pixel(&out, 20, 1, 10)[3], 128);
        assert_eq!(pixel(&out, 20, 1, 11)[3], 128);
    }

    #[test]
    fn pixel_samples_center_instead_of_area_average() {
        let mut data = [0, 0, 255, 255].repeat(20 * 22);
        data[(5 * 20 + 3) * 4..(5 * 20 + 3) * 4 + 4].copy_from_slice(&[255, 0, 0, 255]);
        let src = source(20, 22, data);
        let mut s = settings(Family::Pixel, 20, 22, 1);
        s.font_size = 11;
        assert_eq!(
            pixel(&render_transparent(&src, s, 7), 20, 2, 2),
            [255, 0, 0, 255]
        );
    }

    #[test]
    fn pixel_quantization_thresholds_are_applied_after_tone() {
        for (input, expected) in [
            (25, 0),
            (26, 51),
            (127, 102),
            (128, 153),
            (229, 204),
            (230, 255),
        ] {
            let src = source(20, 22, [input, input, input, 255].repeat(20 * 22));
            let mut s = settings(Family::Pixel, 20, 22, 1);
            s.font_size = 11;
            assert_eq!(
                pixel(&render_transparent(&src, s, 7), 20, 2, 2),
                [expected, expected, expected, 255]
            );
        }
    }
    #[test]
    fn reference_pixel_ink_opacity_is_independent_of_source_alpha() {
        let source =
            SourceImage::new(20, 22, [128, 0, 0, 128].repeat(20 * 22), MAX_SOURCE_BYTES).unwrap();
        let settings = settings(Family::Pixel, 20, 22, 1);
        let out = render_transparent(&source, settings, 1);
        assert_eq!(
            &out[(2 * 20 + 1) * 4..(2 * 20 + 1) * 4 + 4],
            &[153, 0, 0, 255]
        );
    }
}
