//! Spatial 2×4 alpha-safe Braille sampling and captured glyph-mask rasterization.
use super::{
    compose::FrameComposer,
    contract::{Family, StyleSettings},
    geometry::FrameGeometry,
    sampling::AreaSampler,
    StyleFrame,
};
use crate::{
    character::{JobStatus, RenderError, MAX_SOURCE_BYTES},
    reference_characters::{source_identity, ReferenceAtlas},
    source::SourceImage,
};
fn byte(v: f64) -> u8 {
    (v.clamp(0., 255.) + 0.5).floor() as u8
}
fn pack_braille(dots: [bool; 8]) -> u8 {
    dots.into_iter()
        .zip([1, 8, 2, 16, 4, 32, 64, 128])
        .fold(0, |a, (on, b)| a | if on { b } else { 0 })
}
#[derive(Debug)]
pub struct BrailleJob {
    settings: StyleSettings,
    geometry: FrameGeometry,
    identity: (usize, u32, u32, usize, usize),
    atlas_identity: (usize, u16, u16, u16, u64, u64, u16),
    context: crate::style_context::StyleContext,
    composer: FrameComposer,
    sampler: Option<AreaSampler>,
    column: usize,
    row: usize,
    sample_index: usize,
    dots: [bool; 8],
    glyph: u8,
    color: [u8; 3],
    alpha: f64,
    painting: bool,
    paint_x: usize,
    paint_y: usize,
    left: usize,
    right: usize,
    bottom: usize,
    anchor_x: f64,
    anchor_y: f64,
    done: bool,
    cancelled: bool,
}
impl BrailleJob {
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        s: &StyleSettings,
        atlas: &ReferenceAtlas,
        other: usize,
    ) -> Result<usize, RenderError> {
        if !matches!(s.family, Family::Braille { .. }) {
            return Err(RenderError::InvalidInput);
        }
        atlas.validate_braille(s)?;
        FrameGeometry::new(source, s)?;
        let bytes = (s.width as usize)
            .checked_mul(s.height as usize)
            .and_then(|n| n.checked_mul(4))
            .ok_or(RenderError::BudgetExceeded)?;
        let extra = std::mem::size_of::<super::StyleJob>().max(std::mem::size_of::<Self>())
            - std::mem::size_of::<FrameComposer>();
        FrameComposer::estimated_peak_bytes(source, s, bytes, other)?
            .checked_add(extra)
            .and_then(|n| n.checked_add(16))
            .ok_or(RenderError::BudgetExceeded)
    }
    pub fn new(
        source: &SourceImage,
        s: StyleSettings,
        atlas: &ReferenceAtlas,
        other: usize,
    ) -> Result<Self, RenderError> {
        let peak = Self::estimated_peak_bytes(source, &s, atlas, other)?;
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
        let extra = std::mem::size_of::<super::StyleJob>().max(std::mem::size_of::<Self>())
            - std::mem::size_of::<FrameComposer>();
        let composer = FrameComposer::new(
            source,
            s.clone(),
            layer,
            other
                .checked_add(extra + 16)
                .ok_or(RenderError::BudgetExceeded)?,
        )?;
        Ok(Self {
            context: crate::style_context::StyleContext::default(),
            settings: s,
            geometry,
            identity: source_identity(source),
            atlas_identity: atlas.identity(),
            composer,
            sampler: None,
            column: 0,
            row: 0,
            sample_index: 0,
            dots: [false; 8],
            glyph: 0,
            color: [0; 3],
            alpha: 0.,
            painting: false,
            paint_x: 0,
            paint_y: 0,
            left: 0,
            right: 0,
            bottom: 0,
            anchor_x: 0.,
            anchor_y: 0.,
            done: false,
            cancelled: false,
        })
    }
    fn pitch(&self) -> (f64, f64) {
        (
            3. * self.settings.font_size as f64 / 5.,
            self.settings.font_size as f64,
        )
    }
    fn rect(&self) -> [f64; 4] {
        let (w, h) = self.pitch();
        let x = self.column as f64 * w;
        let y = self.row as f64 * h;
        let scale = self.settings.scale as f64;
        if self.sample_index == 0 {
            [
                x,
                y,
                (x + w).min(self.settings.width as f64 / scale),
                (y + h).min(self.settings.height as f64 / scale),
            ]
        } else {
            let d = self.sample_index - 1;
            [
                x + (d % 2) as f64 * w / 2.,
                y + (d / 2) as f64 * h / 4.,
                (x + (d % 2 + 1) as f64 * w / 2.).min(self.settings.width as f64 / scale),
                (y + (d / 2 + 1) as f64 * h / 4.).min(self.settings.height as f64 / scale),
            ]
        }
    }
    fn tone(&self, rgb: [f64; 3]) -> [f64; 3] {
        let k = 259. * (self.settings.contrast + 255.) / (255. * (259. - self.settings.contrast));
        rgb.map(|c| {
            (k * (c - 128.) + 128. + 255. * self.settings.brightness / 100.).clamp(0., 255.)
        })
    }
    fn advance(&mut self) {
        self.column += 1;
        let (w, h) = self.pitch();
        let scale = self.settings.scale as f64;
        if self.column as f64 * w >= self.settings.width as f64 / scale {
            self.column = 0;
            self.row += 1;
        }
        self.done = self.row as f64 * h >= self.settings.height as f64 / scale;
        self.sample_index = 0;
        self.dots = [false; 8];
        self.painting = false;
    }
    fn begin_paint(&mut self, atlas: &ReferenceAtlas) {
        self.glyph = pack_braille(self.dots);
        if self.glyph == 0 || self.alpha == 0. || !self.context.occupied(self.column, self.row) {
            self.advance();
            return;
        }
        let (w, h) = self.pitch();
        self.anchor_x =
            self.column as f64 * w * self.settings.scale as f64 + self.settings.atlas_origin_x;
        self.anchor_y =
            self.row as f64 * h * self.settings.scale as f64 + self.settings.atlas_origin_y;
        let (aw, ah) = atlas.dimensions();
        self.left = self.anchor_x.floor().clamp(0., self.settings.width as f64) as usize;
        self.paint_x = self.left;
        self.paint_y = self.anchor_y.floor().clamp(0., self.settings.height as f64) as usize;
        self.right = (self.anchor_x + aw as f64)
            .ceil()
            .clamp(0., self.settings.width as f64) as usize;
        self.bottom = (self.anchor_y + ah as f64)
            .ceil()
            .clamp(0., self.settings.height as f64) as usize;
        self.painting = self.paint_x < self.right && self.paint_y < self.bottom;
        if !self.painting {
            self.advance()
        }
    }
    fn paint(&mut self, atlas: &ReferenceAtlas) {
        let a = byte(
            self.alpha
                * atlas.bilinear(
                    self.glyph as u16,
                    self.paint_x as f64 - self.anchor_x,
                    self.paint_y as f64 - self.anchor_y,
                ),
        ) as f64
            / 255.;
        if a > 0. {
            let i = (self.paint_y * self.settings.width as usize + self.paint_x) * 4;
            let p = &mut self.composer.layer_mut()[i..i + 4];
            let d = p[3] as f64 / 255.;
            let out = a + d * (1. - a);
            for c in 0..3 {
                p[c] = byte((self.color[c] as f64 * a + p[c] as f64 * d * (1. - a)) / out);
            }
            p[3] = byte(255. * out);
            if p[3] == 0 {
                p.fill(0);
            }
        }
        self.paint_x += 1;
        if self.paint_x >= self.right {
            self.paint_x = self.left;
            self.paint_y += 1;
        }
        if self.paint_y >= self.bottom {
            self.advance();
        }
    }
    pub fn step(
        &mut self,
        source: &SourceImage,
        atlas: &ReferenceAtlas,
        work: u32,
    ) -> Result<JobStatus, RenderError> {
        if self.cancelled {
            return Ok(JobStatus::Cancelled);
        }
        if work == 0 {
            return Ok(self.status());
        }
        if source_identity(source) != self.identity {
            self.cancel();
            return Err(RenderError::MissingSource);
        }
        if atlas.identity() != self.atlas_identity {
            self.cancel();
            return Err(RenderError::MissingCalibration);
        }
        let mut remaining = work;
        while remaining > 0 && !self.done {
            remaining -= 1;
            if self.painting {
                self.paint(atlas);
                continue;
            }
            if self.sampler.is_none() {
                let b = self.rect();
                if b[2] <= b[0] || b[3] <= b[1] {
                    self.sample_index += 1;
                    if self.sample_index == 9 {
                        self.begin_paint(atlas);
                    }
                    continue;
                }
                let mut sampler = AreaSampler::new(b[0], b[1], b[2], b[3])?;
                sampler.begin(&self.geometry);
                self.sampler = Some(sampler);
            }
            if self.sampler.as_mut().unwrap().step(
                source,
                &self.geometry,
                self.settings.rotation,
                1,
            )? == JobStatus::Complete
            {
                let sample = self.sampler.take().unwrap().sample();
                let rgb = self.tone(sample.rgb);
                if self.sample_index == 0 {
                    self.color = rgb.map(byte);
                    self.alpha = sample.alpha * self.settings.opacity / 100.;
                } else {
                    let mut l = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255.;
                    if self.settings.invert {
                        l = 1. - l;
                    }
                    let Family::Braille { threshold } = self.settings.family else {
                        unreachable!()
                    };
                    self.dots[self.sample_index - 1] = sample.alpha > 0. && l >= threshold / 100.;
                }
                self.sample_index += 1;
                if self.sample_index == 9 {
                    self.begin_paint(atlas);
                }
            }
        }
        if self.done && remaining > 0 {
            return self.composer.step(source, remaining);
        }
        Ok(self.status())
    }
    pub fn status(&self) -> JobStatus {
        if self.cancelled {
            JobStatus::Cancelled
        } else if self.done {
            self.composer.status()
        } else {
            JobStatus::Pending
        }
    }
    pub(crate) fn configure_context(&mut self, c: crate::style_context::StyleContext) {
        self.context = c;
        self.composer.configure_context(c);
    }
    pub fn storage_bytes(&self) -> usize {
        self.composer.storage_bytes()
    }
    pub(crate) fn capacity_excess_bytes(&self) -> usize {
        self.composer.capacity_excess_bytes()
    }
    pub fn cancel(&mut self) {
        self.cancelled = true;
        self.sampler = None;
        self.composer.cancel();
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        self.composer.take_frame()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn row_major_bits() {
        for (i, b) in [1, 8, 2, 16, 4, 32, 64, 128].into_iter().enumerate() {
            let mut dots = [false; 8];
            dots[i] = true;
            assert_eq!(pack_braille(dots), b);
        }
        assert_eq!(pack_braille([false; 8]), 0);
        assert_eq!(pack_braille([true; 8]), 255);
    }
}
#[cfg(test)]
mod spatial_tests {
    use super::*;
    use crate::character::Crop;
    fn settings(w: u32, h: u32) -> StyleSettings {
        StyleSettings {
            family: Family::Braille { threshold: 50. },
            width: w,
            height: h,
            scale: 1,
            rotation: 0,
            seed: 0,
            time_us: 0.,
            crop: Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            atlas_count: 256,
            atlas_origin_x: 0.,
            atlas_origin_y: 0.,
            space_index: 65535,
            font_size: 20,
            brightness: 0.,
            contrast: 0.,
            invert: false,
            opacity: 100.,
        }
    }
    fn atlas() -> ReferenceAtlas {
        let mut masks = vec![255; 256];
        masks[0] = 0;
        ReferenceAtlas::new(256, 1, 1, masks, 0., 0., 65535).unwrap()
    }
    #[test]
    fn alpha_safe_cell_and_dot_samples_are_independent() {
        let mut pixels = Vec::new();
        for y in 0..20 {
            for x in 0..12 {
                pixels.extend(if x < 6 && y < 5 {
                    [255, 0, 0, 255]
                } else {
                    [0, 0, 255, 0]
                });
            }
        }
        let source = SourceImage::new(12, 20, pixels, MAX_SOURCE_BYTES).unwrap();
        let a = atlas();
        let mut s = settings(12, 20);
        s.family = Family::Braille { threshold: 20. };
        let mut j = BrailleJob::new(&source, s, &a, 0).unwrap();
        while !j.painting {
            j.step(&source, &a, 1).unwrap();
        }
        assert_eq!(j.glyph, 1);
        assert_eq!(j.color, [255, 0, 0]);
        assert_eq!(j.alpha, 255. / 8.);
    }
    #[test]
    fn partial_dot_geometry_does_not_stretch_or_clamp() {
        let source = SourceImage::new(
            17,
            13,
            [255, 255, 255, 255].repeat(17 * 13),
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        let a = atlas();
        let mut s = settings(17, 13);
        s.font_size = 5;
        let mut j = BrailleJob::new(&source, s, &a, 0).unwrap();
        j.column = 5;
        j.row = 2;
        while !j.painting {
            j.step(&source, &a, 1).unwrap();
        }
        assert_eq!(j.glyph, 63); // 3 rows active, final row entirely outside; both columns have valid area
        assert_eq!((j.anchor_x, j.anchor_y), (15., 10.));
    }
    #[test]
    fn quarter_turn_changes_spatial_dot_identity() {
        let mut pixels = Vec::new();
        for y in 0..12 {
            for x in 0..20 {
                let v = if x < 5 && y < 6 { 255 } else { 0 };
                pixels.extend([v, v, v, 255]);
            }
        }
        let source = SourceImage::new(20, 12, pixels, MAX_SOURCE_BYTES).unwrap();
        let a = atlas();
        let mut s = settings(12, 20);
        s.rotation = 90;
        let mut j = BrailleJob::new(&source, s, &a, 0).unwrap();
        while !j.painting {
            j.step(&source, &a, 1).unwrap();
        }
        assert_eq!(j.glyph, 8);
    }
    #[test]
    fn inversion_preserves_color_and_fractional_mask_alpha_rounds_once() {
        let source =
            SourceImage::new(12, 20, [100, 50, 25, 128].repeat(240), MAX_SOURCE_BYTES).unwrap();
        let mut masks = vec![128; 256];
        masks[0] = 0;
        let a = ReferenceAtlas::new(256, 1, 1, masks, 0., 0., 65535).unwrap();
        let mut s = settings(12, 20);
        s.family = Family::Braille { threshold: 50. };
        s.invert = true;
        s.opacity = 50.;
        let mut j = BrailleJob::new(&source, s, &a, 0).unwrap();
        while !j.painting {
            j.step(&source, &a, 1).unwrap();
        }
        assert_eq!(j.glyph, 255);
        assert_eq!(j.color, [100, 50, 25]);
        j.step(&source, &a, 1).unwrap();
        assert_eq!(&j.composer.layer_mut()[..4], &[100, 50, 25, 32]);
    }
    #[test]
    fn scaled_atlas_origin_is_already_effective_output_units() {
        let source = SourceImage::new(
            12,
            20,
            [255, 255, 255, 255].repeat(12 * 20),
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        let a = atlas();
        let mut s = settings(24, 40);
        s.scale = 2;
        let mut j = BrailleJob::new(&source, s, &a, 0).unwrap();
        while !j.painting {
            j.step(&source, &a, 1).unwrap();
        }
        assert_eq!(j.glyph, 255);
        assert_eq!(j.color, [255; 3]);
    }
}
