//! Complete fixed-context V1 frames. Three alpha-safe box filters are an independently
//! specified approximation of sigma8*S, not a claim of browser/reference blur parity.
use crate::{
    character::{GlyphGrid, JobStatus, RenderError, MAX_SOURCE_BYTES},
    reference_characters::{
        geometry, source_identity, Geometry, ReferenceAtlas, ReferenceBackdrop,
        ReferenceCharactersJob, ReferenceCharactersSettings, ReferenceGlyphLayer,
    },
    source::SourceImage,
};

/// Neighboring odd widths16S-1/16S+1. Equal variance error chooses more lower widths.
pub fn box_radii(scale: u8) -> Result<[usize; 3], RenderError> {
    if !(1..=4).contains(&scale) {
        return Err(RenderError::InvalidInput);
    }
    let r = 8 * scale as usize;
    Ok([r - 1, r - 1, r])
}
#[derive(Debug, Clone, PartialEq)]
pub struct ReferenceCharactersFrame {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub grid: Option<GlyphGrid>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Glyph,
    Resize,
    Blur,
    Composite,
    Done,
    Cancelled,
}
/// One work unit: one glyph unit, four resize taps, one moving-window output
/// (at most65 fixed initialization taps), or one source-over destination pixel.
#[derive(Debug)]
pub struct CompleteCharactersJob {
    context: Option<crate::style_context::StyleContext>,
    settings: ReferenceCharactersSettings,
    geometry: Geometry,
    source_identity: (usize, u32, u32, usize, usize),
    atlas_identity: (usize, u16, u16, u16, u64, u64, u16),
    glyph: Option<ReferenceCharactersJob>,
    layer: Option<ReferenceGlyphLayer>,
    frame: Option<ReferenceCharactersFrame>,
    // Exclusive job ownership; never reused by a second active job.
    a: Vec<[f32; 4]>,
    b: Vec<[f32; 4]>,
    phase: Phase,
    cursor: usize,
    pass: usize,
    sum: [f64; 4],
    canvas_blur: Option<Box<crate::canvas_blur::CanvasBlur>>,
    capacity_excess_bytes: usize,
}
impl CompleteCharactersJob {
    /// Conservative floor includes glyphRGBA, both f32RGBA planes, serialization,
    /// preparation/composition allowance, grid duplication and all inline metadata.
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        s: &ReferenceCharactersSettings,
        atlas: &ReferenceAtlas,
        other: usize,
    ) -> Result<usize, RenderError> {
        geometry(source, s)?;
        let n = s.frame_width as usize * s.frame_height as usize;
        let cells = (s.frame_width as f64 / s.cell_width()).floor() as usize
            * (s.frame_height as f64 / s.cell_height()).floor() as usize;
        source
            .storage_bytes()
            .checked_add(std::mem::size_of::<SourceImage>())
            .and_then(|v| v.checked_add(atlas.storage_bytes()))
            .and_then(|v| {
                v.checked_add(
                    std::mem::size_of::<Self>() + std::mem::size_of::<ReferenceCharactersJob>(),
                )
            })
            .and_then(|v| v.checked_add(n.checked_mul(48)?))
            .and_then(|v| v.checked_add(cells.checked_mul(28)?))
            .and_then(|v| v.checked_add(256))
            .and_then(|v| v.checked_add(other))
            .ok_or(RenderError::BudgetExceeded)
    }
    pub fn new(
        source: &SourceImage,
        s: ReferenceCharactersSettings,
        atlas: &ReferenceAtlas,
        other: usize,
    ) -> Result<Self, RenderError> {
        let peak = Self::estimated_peak_bytes(source, &s, atlas, other)?;
        if peak > source.budget().min(MAX_SOURCE_BYTES) {
            return Err(RenderError::BudgetExceeded);
        }
        let g = geometry(source, &s)?;
        let mut glyph_settings = s.clone();
        glyph_settings.backdrop = ReferenceBackdrop::None;
        let glyph = ReferenceCharactersJob::new(source, glyph_settings, atlas, other)?;
        let n = if s.backdrop == ReferenceBackdrop::Blur {
            s.frame_width as usize * s.frame_height as usize
        } else {
            0
        };
        let allocate = || -> Result<Vec<[f32; 4]>, RenderError> {
            let mut v = Vec::new();
            v.try_reserve_exact(n)
                .map_err(|_| RenderError::BudgetExceeded)?;
            v.resize(n, [0.; 4]);
            Ok(v)
        };
        let (a, b) = (allocate()?, allocate()?);
        let excess = (a.capacity() - n + b.capacity() - n) * 16;
        // Glyph job independently checks its actual output/grid capacities.
        let glyph_requested = s.frame_width as usize * s.frame_height as usize * 4
            + (s.frame_width as f64 / s.cell_width()).floor() as usize
                * (s.frame_height as f64 / s.cell_height()).floor() as usize
                * 14;
        let excess = excess + glyph.storage_bytes().saturating_sub(glyph_requested) * 2;
        if peak
            .checked_add(excess)
            .is_none_or(|v| v > source.budget().min(MAX_SOURCE_BYTES))
        {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(Self {
            context: None,
            settings: s,
            geometry: g,
            source_identity: source_identity(source),
            atlas_identity: atlas.identity(),
            glyph: Some(glyph),
            layer: None,
            frame: None,
            a,
            b,
            phase: Phase::Glyph,
            cursor: 0,
            pass: 0,
            sum: [0.; 4],
            canvas_blur: None,
            capacity_excess_bytes: excess,
        })
    }
    pub(crate) fn context_storage_bytes() -> usize {
        std::mem::size_of::<crate::canvas_blur::CanvasBlur>()
    }
    pub(crate) fn configure_context(&mut self, c: crate::style_context::StyleContext) {
        self.context = Some(c);
        self.canvas_blur = Some(Box::new(crate::canvas_blur::CanvasBlur::new(c.softness)));
        if let Some(g) = self.glyph.as_mut() {
            g.configure_context(c);
        }
    }
    pub(crate) fn capacity_excess_bytes(&self) -> usize {
        self.capacity_excess_bytes
    }
    pub fn storage_bytes(&self) -> usize {
        self.canvas_blur
            .as_ref()
            .map_or(0, |_| Self::context_storage_bytes())
            + self.a.capacity() * 16
            + self.b.capacity() * 16
            + self.glyph.as_ref().map_or(0, |g| g.storage_bytes())
            + self
                .layer
                .as_ref()
                .map_or(0, |l| layer_bytes(&l.rgba, &l.grid))
            + self
                .frame
                .as_ref()
                .map_or(0, |f| layer_bytes(&f.rgba, &f.grid))
    }
    pub fn status(&self) -> JobStatus {
        match self.phase {
            Phase::Done => JobStatus::Complete,
            Phase::Cancelled => JobStatus::Cancelled,
            _ => JobStatus::Pending,
        }
    }
    pub fn cancel(&mut self) {
        self.phase = Phase::Cancelled;
        self.canvas_blur = None;
        self.glyph = None;
        self.layer = None;
        self.frame = None;
        self.a = Vec::new();
        self.b = Vec::new();
    }
    pub fn take_frame(&mut self) -> Option<ReferenceCharactersFrame> {
        if self.phase == Phase::Done {
            self.frame.take()
        } else {
            None
        }
    }
    pub fn step(
        &mut self,
        source: &SourceImage,
        atlas: &ReferenceAtlas,
        max_work: u32,
    ) -> Result<JobStatus, RenderError> {
        if self.status() != JobStatus::Pending {
            return Ok(self.status());
        }
        let error = if source_identity(source) != self.source_identity {
            Some(RenderError::MissingSource)
        } else if atlas.identity() != self.atlas_identity {
            Some(RenderError::MissingCalibration)
        } else {
            None
        };
        if let Some(error) = error {
            self.cancel();
            return Err(error);
        }
        for _ in 0..max_work {
            match self.phase {
                Phase::Glyph => {
                    let result = self.glyph.as_mut().unwrap().step(source, atlas, 1);
                    let status = match result {
                        Ok(v) => v,
                        Err(e) => {
                            self.cancel();
                            return Err(e);
                        }
                    };
                    if status == JobStatus::Complete {
                        self.layer = self.glyph.as_mut().unwrap().take_glyph_layer();
                        self.glyph = None;
                        self.phase = if self.settings.backdrop == ReferenceBackdrop::Blur {
                            Phase::Resize
                        } else {
                            Phase::Composite
                        };
                    }
                }
                Phase::Resize => {
                    self.resize_pixel(source);
                    self.cursor += 1;
                    if self.cursor == self.a.len() {
                        self.cursor = 0;
                        self.phase = if self
                            .context
                            .is_some_and(|c| c.backdrop != 3 || c.softness == 0.)
                        {
                            Phase::Composite
                        } else {
                            Phase::Blur
                        };
                    }
                }
                Phase::Blur => self.blur_pixel(),
                Phase::Composite => self.composite_pixel(),
                Phase::Done | Phase::Cancelled => break,
            }
        }
        Ok(self.status())
    }
    fn resize_pixel(&mut self, source: &SourceImage) {
        resize_pixel_into(
            &mut self.a,
            self.cursor,
            source,
            &self.geometry,
            self.settings.rotation,
            self.settings.render_scale,
        );
    }
    fn blur_pixel(&mut self) {
        if self.context.is_some() {
            self.canvas_blur.as_ref().unwrap().pixel(
                &self.a,
                &mut self.b,
                self.settings.frame_width as usize,
                self.settings.frame_height as usize,
                self.pass,
                self.cursor,
            );
        } else {
            blur_pixel_radius_into(
                &mut self.a,
                &mut self.b,
                self.settings.frame_width as usize,
                self.settings.frame_height as usize,
                self.settings.render_scale,
                self.context.map_or(8., |c| c.softness),
                self.pass,
                self.cursor,
                &mut self.sum,
            );
        }
        self.cursor += 1;
        if self.cursor == self.a.len() {
            std::mem::swap(&mut self.a, &mut self.b);
            self.cursor = 0;
            self.pass += 1;
            if self.pass == if self.context.is_some() { 2 } else { 6 } {
                self.b = Vec::new();
                self.phase = Phase::Composite;
            }
        }
    }
    fn composite_pixel(&mut self) {
        let backdrop = if let Some(c) = self.context {
            match c.backdrop {
                0 => [0.; 4],
                1 => [0., 0., 0., 1.],
                _ => self.a[self.cursor],
            }
        } else {
            match self.settings.backdrop {
                ReferenceBackdrop::None => [0.; 4],
                ReferenceBackdrop::Solid => [0., 0., 0., 1.],
                ReferenceBackdrop::Blur => self.a[self.cursor],
            }
        };
        let layer = self.layer.as_mut().unwrap();
        let p = &mut layer.rgba[self.cursor * 4..self.cursor * 4 + 4];
        if let Some(c) = self.context {
            c.composite_webgl(p, backdrop);
        } else {
            source_over(p, backdrop);
        }
        self.cursor += 1;
        if self.cursor == layer.rgba.len() / 4 {
            let layer = self.layer.take().unwrap();
            self.a = Vec::new();
            self.frame = Some(ReferenceCharactersFrame {
                version: layer.version,
                width: layer.width,
                height: layer.height,
                rgba: layer.rgba,
                grid: layer.grid,
            });
            self.phase = Phase::Done;
        }
    }
}
/// Original-source premultiplied bilinear interpolation; shared with style composition.
pub(crate) fn resize_pixel_into(
    a: &mut [[f32; 4]],
    cursor: usize,
    source: &SourceImage,
    geometry: &Geometry,
    rotation: u16,
    scale: u8,
) {
    let (pw, ph) = geometry.extent();
    let w = pw * scale as usize;
    let s = scale as f64;
    let x = ((cursor % w) as f64 + 0.5) / s - 0.5;
    let y = ((cursor / w) as f64 + 0.5) / s - 0.5;
    let (ix, iy) = (x.floor(), y.floor());
    let (fx, fy) = (x - ix, y - iy);
    let mut p = [0.; 4];
    for (dx, dy, weight) in [
        (0., 0., (1. - fx) * (1. - fy)),
        (1., 0., fx * (1. - fy)),
        (0., 1., (1. - fx) * fy),
        (1., 1., fx * fy),
    ] {
        let c = geometry.pixel(
            source,
            rotation,
            (ix + dx).clamp(0., (pw - 1) as f64) as usize,
            (iy + dy).clamp(0., (ph - 1) as f64) as usize,
        );
        let alpha = c[3] as f64 / 255.;
        for k in 0..3 {
            p[k] += c[k] as f64 * alpha * weight;
        }
        p[3] += alpha * weight;
    }
    a[cursor] = p.map(|v| v as f32);
}
/// One moving-window output; at most481 initialization taps at softness60/scale4.
pub(crate) fn blur_pixel_radius_into(
    a: &mut [[f32; 4]],
    b: &mut [[f32; 4]],
    w: usize,
    h: usize,
    scale: u8,
    softness: f64,
    pass: usize,
    cursor: usize,
    sum: &mut [f64; 4],
) {
    let horizontal = pass % 2 == 0;
    let (length, _) = if horizontal { (w, h) } else { (h, w) };
    let (line, pos) = (cursor / length, cursor % length);
    let r = (softness * scale as f64).round() as usize;
    let radius = if pass / 2 < 2 { r.saturating_sub(1) } else { r };
    let at = |p: isize| {
        let p = p.clamp(0, length as isize - 1) as usize;
        if horizontal {
            line * w + p
        } else {
            p * w + line
        }
    };
    if pos == 0 {
        *sum = [0.; 4];
        for d in -(radius as isize)..=radius as isize {
            let p = a[at(d)];
            for (k, v) in sum.iter_mut().enumerate() {
                *v += p[k] as f64;
            }
        }
    } else {
        let old = a[at(pos as isize - radius as isize - 1)];
        let new = a[at(pos as isize + radius as isize)];
        for k in 0..4 {
            sum[k] += new[k] as f64 - old[k] as f64;
        }
    }
    b[at(pos as isize)] = sum.map(|v| (v / (2 * radius + 1) as f64) as f32);
}
/// BackdropRGB is already premultiplied in byte color units; alpha is0..1.
pub(crate) fn source_over(glyph: &mut [u8], backdrop: [f32; 4]) {
    let ga = glyph[3] as f64 / 255.;
    let ba = (backdrop[3] as f64).clamp(0., 1.);
    let a = ga + ba * (1. - ga);
    let out_alpha = (a * 255.).round() as u8;
    if out_alpha == 0 {
        glyph.fill(0);
        return;
    }
    for k in 0..3 {
        glyph[k] = ((glyph[k] as f64 * ga + backdrop[k] as f64 * (1. - ga)) / a)
            .clamp(0., 255.)
            .round() as u8;
    }
    glyph[3] = out_alpha;
}
fn layer_bytes(rgba: &Vec<u8>, grid: &Option<GlyphGrid>) -> usize {
    rgba.capacity()
        + grid.as_ref().map_or(0, |g| {
            g.glyph_indices.capacity() * 2
                + g.foreground.capacity()
                + g.background.capacity()
                + g.alpha.capacity() * 4
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::character::Crop;
    #[test]
    fn context_backdrop_matches_full_independent_canvas_gradient() {
        let mut pixels = Vec::new();
        for y in 0..64u8 {
            for x in 0..128u8 {
                pixels.extend([2 * x, 4 * y, 255 - 2 * x, if x < 13 { 0 } else { 255 }]);
            }
        }
        let src = SourceImage::new(128, 64, pixels, MAX_SOURCE_BYTES).unwrap();
        let atlas = ReferenceAtlas::new(2, 1, 1, vec![0, 0], 0., 0., 65535).unwrap();
        let settings = ReferenceCharactersSettings {
            version: 1,
            frame_width: 128,
            frame_height: 64,
            font_size: 80.,
            render_scale: 1,
            brightness: 0.,
            contrast: 0.,
            crop: Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            rotation: 0,
            backdrop: ReferenceBackdrop::Blur,
        };
        let expected =
            include_bytes!("../../tests/fixtures/render/backdrop/canvas-gradient-blur8.rgba");
        for work in [1, 4096] {
            let mut job = CompleteCharactersJob::new(&src, settings.clone(), &atlas, 0).unwrap();
            job.configure_context(crate::style_context::StyleContext::default());
            while job.step(&src, &atlas, work).unwrap() == JobStatus::Pending {}
            let out = job.take_frame().unwrap().rgba;
            let first = out.iter().zip(expected).position(|(a, b)| a != b);
            assert!(
                first.is_none(),
                "first byte mismatch {:?}",
                first.map(|i| (i, out[i], expected[i]))
            );
            job.cancel();
            assert_eq!(job.storage_bytes(), 0);
        }
    }

    fn resized(
        source: &SourceImage,
        scale: u8,
        rotation: u16,
        crop: Crop,
        w: u32,
        h: u32,
    ) -> Vec<[f32; 4]> {
        let atlas = ReferenceAtlas::new(2, 1, 1, vec![0, 0], 0., 0., 65535).unwrap();
        let s = ReferenceCharactersSettings {
            version: 1,
            frame_width: w,
            frame_height: h,
            font_size: 80.,
            render_scale: scale,
            brightness: 0.,
            contrast: 0.,
            crop,
            rotation,
            backdrop: ReferenceBackdrop::Blur,
        };
        let mut j = CompleteCharactersJob::new(source, s, &atlas, 0).unwrap();
        j.step(source, &atlas, 1 + w * h).unwrap();
        assert_eq!(j.phase, Phase::Blur);
        j.a
    }
    #[test]
    fn bilinear_s4_pixel_centers_have_independent_premultiplied_weights() {
        let src =
            SourceImage::new(2, 1, vec![255, 0, 0, 0, 0, 0, 255, 255], MAX_SOURCE_BYTES).unwrap();
        let out = resized(
            &src,
            4,
            0,
            Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            8,
            4,
        );
        for row in out.chunks_exact(8) {
            for (p, a) in row.iter().zip([0., 0., 0.125, 0.375, 0.625, 0.875, 1., 1.]) {
                assert_eq!(*p, [0., 0., 255. * a, a]);
            }
        }
    }
    #[test]
    fn s1_centers_and_quarter_turns_share_glyph_crop_geometry() {
        let p = vec![
            10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255, 50, 0, 0, 255, 60, 0, 0,
            255,
        ];
        let src = SourceImage::new(3, 2, p, MAX_SOURCE_BYTES).unwrap();
        let crop = Crop {
            x: 1. / 3.,
            y: 0.,
            width: 2. / 3.,
            height: 1.,
        };
        for (rotation, expected) in [
            (0, [20., 30., 50., 60.]),
            (90, [50., 20., 60., 30.]),
            (180, [60., 50., 30., 20.]),
            (270, [30., 60., 20., 50.]),
        ] {
            let out = resized(&src, 1, rotation, crop, 2, 2);
            assert_eq!(out.iter().map(|p| p[0]).collect::<Vec<_>>(), expected);
        }
    }
    #[test]
    fn source_over_partial_alpha_and_canonical_byte_zero() {
        let mut p = [200, 100, 0, 128];
        source_over(&mut p, [0., 0., 255. * (128f32 / 255.), 128f32 / 255.]);
        assert_eq!(p, [134, 67, 85, 192]);
        let mut p = [255, 99, 50, 0];
        source_over(&mut p, [0.001, 0., 0., 0.001 / 255.]);
        assert_eq!(p, [0, 0, 0, 0]);
        let mut p = [200, 100, 50, 128];
        source_over(&mut p, [0., 0., 0., 1.]);
        assert_eq!(p, [100, 50, 25, 255]);
    }
    #[test]
    fn premultiplied_kernel_retains_exact_independent_impulse_coefficients_before_quantization() {
        let mut pixels = [0, 0, 0, 255].repeat(101);
        pixels[200..203].fill(255);
        let source = SourceImage::new(101, 1, pixels, MAX_SOURCE_BYTES).unwrap();
        let atlas = ReferenceAtlas::new(2, 1, 1, vec![0, 0], 0., 0., 65535).unwrap();
        let s = ReferenceCharactersSettings {
            version: 1,
            frame_width: 101,
            frame_height: 1,
            font_size: 80.,
            render_scale: 1,
            brightness: 0.,
            contrast: 0.,
            crop: Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            rotation: 0,
            backdrop: ReferenceBackdrop::Blur,
        };
        let mut j = CompleteCharactersJob::new(&source, s, &atlas, 0).unwrap();
        j.step(&source, &atlas, 1 + 7 * 101).unwrap();
        assert_eq!(j.phase, Phase::Composite);
        for (offset, count) in [(0, 183), (8, 120), (22, 1)] {
            assert!((j.a[50 + offset][0] as f64 / 255. - count as f64 / 3825.).abs() < 1e-8);
            assert_eq!(j.a[50 + offset][3], 1.);
        }
        assert_eq!(j.a[73][0], 0.);
    }
}
