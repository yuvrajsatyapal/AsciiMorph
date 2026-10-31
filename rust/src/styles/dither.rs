//! Independent deterministic palette dithering. Sampling and painting are cooperative;
//! diffusion retains exactly three rows, and palette storage is bounded at 256 colors.
use super::{
    compose::FrameComposer,
    contract::{DitherSettings, Family, StyleSettings},
    dither_sampling::ImageSampler,
    geometry::FrameGeometry,
    StyleFrame,
};
use crate::{
    character::{JobStatus, RenderError, MAX_SOURCE_BYTES},
    reference_characters::source_identity,
    source::SourceImage,
};
#[path = "dither_tables.rs"]
mod tables;
fn byte(v: f64) -> u8 {
    (v.clamp(0., 255.) + 0.5).floor() as u8
}
fn luma(c: [f64; 3]) -> f64 {
    c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
}
fn palette(d: &DitherSettings) -> Vec<[u8; 3]> {
    match d.palette {
        0..=13 => tables::PALETTES[d.palette as usize].to_vec(),
        15 => d.custom.clone(),
        _ => (0..256)
            .map(|i| {
                [
                    byte((i / 32) as f64 * 255. / 7.),
                    byte(((i / 4) % 8) as f64 * 255. / 7.),
                    byte((i % 4) as f64 * 85.),
                ]
            })
            .collect(),
    }
}
fn quantize(c: [f64; 3], p: &[[u8; 3]], mode: u32) -> [f64; 3] {
    if mode == 2 {
        return std::array::from_fn(|k| {
            p.iter()
                .map(|v| v[k])
                .min_by(|a, b| {
                    (c[k] - *a as f64)
                        .abs()
                        .total_cmp(&(c[k] - *b as f64).abs())
                        .then(a.cmp(b))
                })
                .unwrap() as f64
        });
    }
    let distance = |v: &[u8; 3]| {
        let v = v.map(|x| x as f64);
        if mode == 1 {
            (luma(c) - luma(v)).powi(2)
        } else {
            (0..3).map(|k| (c[k] - v[k]).powi(2)).sum()
        }
    };
    let mut best = p[0];
    let mut score = distance(&best);
    for v in &p[1..] {
        let s = distance(v);
        if s < score {
            best = *v;
            score = s;
        }
    }
    best.map(|x| x as f64)
}
fn bayer(x: usize, y: usize, n: usize) -> usize {
    if n == 1 {
        0
    } else {
        4 * bayer(x % (n / 2), y % (n / 2), n / 2) + [[0, 2], [3, 1]][y / (n / 2)][x / (n / 2)]
    }
}
fn pattern(d: &DitherSettings, x: usize, y: usize, _seed: u32) -> f64 {
    let a = d.angle.to_radians();
    let (s, c) = a.sin_cos();
    let xx = x as f64 * c - y as f64 * s;
    let yy = x as f64 * s + y as f64 * c;
    let ix = xx.floor() as i64;
    let iy = yy.floor() as i64;
    match d.algorithm {
        0..=3 => {
            let n = 2usize << (d.algorithm as usize);
            (bayer(
                ix.rem_euclid(n as i64) as usize,
                iy.rem_euclid(n as i64) as usize,
                n,
            ) as f64
                + 0.5)
                / (n * n) as f64
        }
        4 => {
            const DOTS: [[u8; 8]; 8] = [
                [24, 10, 12, 26, 35, 47, 49, 37],
                [8, 0, 2, 14, 45, 59, 61, 51],
                [22, 6, 4, 16, 43, 57, 63, 53],
                [30, 20, 18, 28, 33, 41, 55, 39],
                [34, 46, 48, 36, 25, 11, 13, 27],
                [44, 58, 60, 50, 9, 1, 3, 15],
                [42, 56, 62, 52, 23, 7, 5, 17],
                [32, 40, 54, 38, 31, 21, 19, 29],
            ];
            (DOTS[y % 8][x % 8] as f64 + 0.5) / 64.
        }
        5 => {
            let dx = xx.rem_euclid(8.) - 4.;
            let dy = yy.rem_euclid(8.) - 4.;
            (dx.hypot(dy) / (0.707 * 8.)).min(1.)
        }
        6 => yy.rem_euclid(8.) / 8.,
        7 => xx.rem_euclid(8.) / 8.,
        8 => (xx + yy).rem_euclid(8.) / 8.,
        9 => {
            // ECMAScript Number multiplication precedes the bitwise conversion;
            // integer wrapping multiplication would retain different low bits.
            let v = (x as u32).wrapping_mul(0x466f45d) ^ (y as u32).wrapping_mul(0x127409f);
            let v = (v ^ (v >> 13)) as i32;
            let v = ((v as f64 * 0x4bf19f61u32 as f64).rem_euclid(4294967296.)) as u32;
            ((v ^ (v >> 16)) & 255) as f64 / 255.
        }
        10 => tables::BLUE_NOISE[(y % 128) * 128 + x % 128] as f64 / 255.,
        _ => 0.5,
    }
}
fn kernel(algorithm: u32) -> &'static [(isize, usize, f64)] {
    match algorithm {
        11 => &[
            (1, 0, 7. / 16.),
            (-1, 1, 3. / 16.),
            (0, 1, 5. / 16.),
            (1, 1, 1. / 16.),
        ],
        12 => &[
            (1, 0, 0.125),
            (2, 0, 0.125),
            (-1, 1, 0.125),
            (0, 1, 0.125),
            (1, 1, 0.125),
            (0, 2, 0.125),
        ],
        13 => &[
            (1, 0, 8. / 42.),
            (2, 0, 4. / 42.),
            (-2, 1, 2. / 42.),
            (-1, 1, 4. / 42.),
            (0, 1, 8. / 42.),
            (1, 1, 4. / 42.),
            (2, 1, 2. / 42.),
            (-2, 2, 1. / 42.),
            (-1, 2, 2. / 42.),
            (0, 2, 4. / 42.),
            (1, 2, 2. / 42.),
            (2, 2, 1. / 42.),
        ],
        14 => &[(1, 0, 0.5), (-1, 1, 0.25), (0, 1, 0.25)],
        _ => &[],
    }
}
#[derive(Debug)]
pub struct DitherJob {
    settings: StyleSettings,
    d: DitherSettings,
    geometry: FrameGeometry,
    identity: (usize, u32, u32, usize, usize),
    composer: FrameComposer,
    palette: Vec<[u8; 3]>,
    errors: Vec<[f32; 3]>,
    cols: usize,
    rows: usize,
    input_ready: bool,
    initialized_rows: usize,
    initialize_x: usize,
    x: usize,
    y: usize,
    sampler: Option<ImageSampler>,
    color: [u8; 4],
    paint: usize,
    painting: bool,
    done: bool,
    cancelled: bool,
    context: crate::style_context::StyleContext,
}
impl DitherJob {
    fn extra(s: &StyleSettings) -> Result<usize, RenderError> {
        s.validate()?;
        let Family::Dither(d) = &s.family else {
            return Err(RenderError::InvalidInput);
        };
        let pitch = (d.pixel_size as usize)
            .checked_mul(s.scale as usize)
            .ok_or(RenderError::BudgetExceeded)?;
        let cols = (s.width as usize).div_ceil(pitch);
        std::mem::size_of::<super::StyleJob>()
            .checked_sub(std::mem::size_of::<FrameComposer>())
            .and_then(|n| n.checked_add(cols.checked_mul(36)?))
            .and_then(|n| n.checked_add(256 * 3))
            .and_then(|n| n.checked_add(d.custom.capacity().checked_mul(9)?))
            .ok_or(RenderError::BudgetExceeded)
    }
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        s: &StyleSettings,
        other: usize,
    ) -> Result<usize, RenderError> {
        FrameGeometry::new(source, s)?;
        let bytes = (s.width as usize)
            .checked_mul(s.height as usize)
            .and_then(|n| n.checked_mul(4))
            .ok_or(RenderError::BudgetExceeded)?;
        let retained = other
            .checked_add(Self::extra(s)?)
            .ok_or(RenderError::BudgetExceeded)?;
        FrameComposer::estimated_peak_bytes(source, s, bytes, retained)
    }
    pub fn new(source: &SourceImage, s: StyleSettings, other: usize) -> Result<Self, RenderError> {
        let peak = Self::estimated_peak_bytes(source, &s, other)?;
        if peak > source.budget().min(MAX_SOURCE_BYTES) {
            return Err(RenderError::BudgetExceeded);
        }
        let Family::Dither(d) = &s.family else {
            return Err(RenderError::InvalidInput);
        };
        let d = d.clone();
        let geometry = FrameGeometry::new(source, &s)?;
        let pitch = (d.pixel_size as usize)
            .checked_mul(s.scale as usize)
            .ok_or(RenderError::BudgetExceeded)?;
        let cols = ((s.width as f64 / pitch as f64).round() as usize).max(1);
        let rows = ((s.height as f64 / pitch as f64).round() as usize).max(1);
        let mut layer = Vec::new();
        let n = (s.width as usize)
            .checked_mul(s.height as usize)
            .and_then(|n| n.checked_mul(4))
            .ok_or(RenderError::BudgetExceeded)?;
        layer
            .try_reserve_exact(n)
            .map_err(|_| RenderError::BudgetExceeded)?;
        layer.resize(n, 0);
        let mut errors = Vec::new();
        let error_count = cols.checked_mul(3).ok_or(RenderError::BudgetExceeded)?;
        errors
            .try_reserve_exact(error_count)
            .map_err(|_| RenderError::BudgetExceeded)?;
        errors.resize(error_count, [0.; 3]);
        let palette = palette(&d);
        let excess = layer
            .capacity()
            .checked_sub(n)
            .and_then(|n| {
                n.checked_add(
                    errors
                        .capacity()
                        .checked_sub(error_count)?
                        .checked_mul(12)?,
                )
            })
            .and_then(|n| n.checked_add(palette.capacity().saturating_sub(256).checked_mul(3)?))
            .ok_or(RenderError::BudgetExceeded)?;
        if peak
            .checked_add(excess)
            .is_none_or(|n| n > source.budget().min(MAX_SOURCE_BYTES))
        {
            return Err(RenderError::BudgetExceeded);
        }
        let composer_other = other
            .checked_add(Self::extra(&s)?)
            .and_then(|n| n.checked_add(excess))
            .ok_or(RenderError::BudgetExceeded)?;
        let mut composer = FrameComposer::new(source, s.clone(), layer, composer_other)?;
        composer.configure_context(crate::style_context::StyleContext {
            backdrop: 0,
            ..Default::default()
        });
        Ok(Self {
            settings: s,
            d,
            geometry,
            identity: source_identity(source),
            composer,
            palette,
            errors,
            cols,
            rows,
            input_ready: true,
            initialized_rows: 0,
            initialize_x: 0,
            x: 0,
            y: 0,
            sampler: None,
            color: [0; 4],
            paint: 0,
            painting: false,
            done: false,
            cancelled: false,
            context: crate::style_context::StyleContext {
                backdrop: 2,
                ..Default::default()
            },
        })
    }
    fn bounds(&self) -> [usize; 4] {
        let edge = |index: usize, extent: u32, count: usize| {
            ((index as f64 * extent as f64 / count as f64 - 0.5)
                .ceil()
                .max(0.) as usize)
                .min(extent as usize)
        };
        [
            edge(self.x, self.settings.width, self.cols),
            edge(self.y, self.settings.height, self.rows),
            edge(self.x + 1, self.settings.width, self.cols),
            edge(self.y + 1, self.settings.height, self.rows),
        ]
    }
    fn tone(&self, rgb: [f64; 3]) -> [f64; 3] {
        rgb.map(|v| {
            (((v / 255. - 0.5) * (self.d.contrast / 100.) + 0.5) * 255.)
                .clamp(0., 255.)
                .round_ties_even()
        })
    }
    fn finish_sample(&mut self) {
        let sample = self.sampler.take().unwrap().sample();
        let row = self.y % 3;
        let ei = row * self.cols + self.x;
        let incoming = self.errors[ei];
        self.errors[ei] = [0.; 3];
        let out;
        {
            let base = self.tone(sample.rgb);
            let threshold_bias = (self.d.threshold - 50.) * 2.54;
            let bias = if self.d.algorithm < 11 {
                let threshold = ((pattern(&self.d, self.x, self.y, self.settings.seed) * 255.
                    - 128.)
                    * self.d.strength
                    / 100.
                    + 128.
                    - threshold_bias)
                    .clamp(0., 255.);
                (threshold - 128.) * 0.5
            } else {
                threshold_bias
            };
            let input = std::array::from_fn(|k| {
                if self.d.algorithm >= 11 {
                    incoming[k] as f64
                } else {
                    base[k] + bias
                }
            });
            let q = quantize(input, &self.palette, self.d.chroma);
            if self.d.algorithm >= 11 {
                let mut error =
                    std::array::from_fn::<_, 3, _>(|k| (input[k] - q[k]) * self.d.strength / 100.);
                if self.d.chroma == 1 {
                    error = [(luma(input) - luma(q)) * self.d.strength / 100.; 3];
                }
                for &(dx, dy, w) in kernel(self.d.algorithm) {
                    let x = self.x as isize + dx * if self.y % 2 == 1 { -1 } else { 1 };
                    if x >= 0 && (x as usize) < self.cols && self.y + dy < self.rows {
                        let i = ((self.y + dy) % 3) * self.cols + x as usize;
                        for k in 0..3 {
                            self.errors[i][k] = (self.errors[i][k] as f64 + error[k] * w) as f32;
                        }
                    }
                }
            }
            out = q;
        }
        self.color = [byte(out[0]), byte(out[1]), byte(out[2]), byte(sample.alpha)];
        if sample.alpha == 0.
            || self.context.backdrop == 0
            || !self.context.occupied(self.x, self.y)
        {
            self.color = [0; 4];
        }
        self.paint = 0;
        self.painting = true;
    }
    fn sampler_at(&self, x: usize, y: usize) -> Result<ImageSampler, RenderError> {
        if self.prepared_input() {
            ImageSampler::for_extent(
                self.settings.width as usize,
                self.settings.height as usize,
                self.cols,
                self.rows,
                x,
                y,
            )
        } else {
            ImageSampler::new(&self.geometry, self.cols, self.rows, x, y)
        }
    }
    fn prepared_input(&self) -> bool {
        self.context.backdrop == 3
            || self.context.backdrop == 2 && self.context.background_opacity < 100.
    }
    fn step_sampler(&mut self, source: &SourceImage) -> Result<JobStatus, RenderError> {
        let prepared = self.prepared_input();
        let context = self.context;
        let composer = &self.composer;
        let geometry = &self.geometry;
        let rotation = self.settings.rotation;
        self.sampler.as_mut().unwrap().step_pixels(1, |x, y| {
            if context.backdrop == 0 {
                [0; 4]
            } else if context.backdrop == 1 {
                [0, 0, 0, 255]
            } else if prepared {
                composer.input_pixel(x, y, context.background_opacity)
            } else {
                geometry.pixel(source, rotation, x, y)
            }
        })
    }
    pub fn step(&mut self, source: &SourceImage, work: u32) -> Result<JobStatus, RenderError> {
        if self.cancelled {
            return Ok(JobStatus::Cancelled);
        }
        if source_identity(source) != self.identity {
            self.cancel();
            return Err(RenderError::MissingSource);
        }
        let mut remaining = work;
        while remaining > 0 && !self.done {
            if !self.input_ready {
                self.input_ready = self.composer.prepare_input(source, 1)?;
                remaining -= 1;
                continue;
            }
            if self.painting {
                let [x0, y0, x1, y1] = self.bounds();
                let w = x1 - x0;
                let x = x0 + self.paint % w;
                let y = y0 + self.paint / w;
                let i = (y * self.settings.width as usize + x) * 4;
                self.composer.layer_mut()[i..i + 4].copy_from_slice(&self.color);
                self.paint += 1;
                remaining -= 1;
                if self.paint == w * (y1 - y0) {
                    self.painting = false;
                    let reverse = self.d.algorithm >= 11 && self.y % 2 == 1;
                    let row_end = if reverse {
                        self.x == 0
                    } else {
                        self.x + 1 == self.cols
                    };
                    if row_end {
                        self.y += 1;
                        self.x = if self.d.algorithm >= 11 && self.y % 2 == 1 {
                            self.cols - 1
                        } else {
                            0
                        };
                    } else if reverse {
                        self.x -= 1;
                    } else {
                        self.x += 1;
                    }
                    self.done = self.y == self.rows;
                }
                continue;
            }
            // Initialize the current and two future rows before any error reaches
            // them. Each neighbor update then rounds base + accumulated error to
            // f32, just as a full working plane would, without retaining that plane.
            if self.d.algorithm >= 11 && self.initialized_rows < (self.y + 3).min(self.rows) {
                if self.sampler.is_none() {
                    self.sampler = Some(self.sampler_at(self.initialize_x, self.initialized_rows)?);
                }
                let status = self.step_sampler(source)?;
                remaining -= 1;
                if status == JobStatus::Complete {
                    let sample = self.sampler.take().unwrap().sample();
                    let bias = (self.d.threshold - 50.) * 2.54;
                    let base = self
                        .tone(sample.rgb)
                        .map(|v| (v as f32 as f64 + bias) as f32);
                    self.errors[(self.initialized_rows % 3) * self.cols + self.initialize_x] = base;
                    self.initialize_x += 1;
                    if self.initialize_x == self.cols {
                        self.initialize_x = 0;
                        self.initialized_rows += 1;
                    }
                }
                continue;
            }
            if self.sampler.is_none() {
                self.sampler = Some(self.sampler_at(self.x, self.y)?);
            }
            let status = self.step_sampler(source)?;
            remaining -= 1;
            if status == JobStatus::Complete {
                self.finish_sample();
            }
        }
        if self.done {
            self.composer
                .configure_context(crate::style_context::StyleContext {
                    backdrop: 0,
                    ..Default::default()
                });
            self.composer.step(source, remaining)
        } else {
            Ok(JobStatus::Pending)
        }
    }
    pub fn configure_context(&mut self, c: crate::style_context::StyleContext) {
        self.context = c;
        self.input_ready = !self.prepared_input();
        self.composer.configure_context(c);
    }

    pub fn storage_bytes(&self) -> usize {
        self.composer.storage_bytes()
            + self.errors.capacity() * 12
            + self.palette.capacity() * 3
            + self.d.custom.capacity() * 3
            + if let Family::Dither(d) = &self.settings.family {
                d.custom.capacity() * 3
            } else {
                0
            }
    }
    pub fn capacity_excess_bytes(&self) -> usize {
        self.composer.capacity_excess_bytes()
            + (self.errors.capacity() - self.cols * 3) * 12
            + self.palette.capacity().saturating_sub(256) * 3
    }
    pub fn cancel(&mut self) {
        self.cancelled = true;
        self.errors = Vec::new();
        self.palette = Vec::new();
        self.d.custom = Vec::new();
        if let Family::Dither(d) = &mut self.settings.family {
            d.custom = Vec::new();
        }
        self.sampler = None;
        self.composer.cancel();
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        self.composer.take_frame()
    }
}
#[cfg(test)]
pub(super) mod tests {
    use super::*;
    pub(crate) fn d() -> DitherSettings {
        DitherSettings {
            algorithm: 11,
            palette: 0,
            chroma: 0,
            pixel_size: 1,
            strength: 100.,
            contrast: 100.,
            threshold: 50.,
            angle: 0.,
            custom: vec![[0; 3], [255; 3]],
            animate: false,
            shimmer: false,
            direction: 0,
            speed: 4,
        }
    }
    pub(crate) fn settings(w: u32, h: u32, d: DitherSettings) -> StyleSettings {
        StyleSettings {
            family: Family::Dither(d),
            width: w,
            height: h,
            scale: 1,
            rotation: 0,
            seed: 123,
            time_us: 0.,
            crop: crate::character::Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            atlas_count: 0,
            atlas_origin_x: 0.,
            atlas_origin_y: 0.,
            space_index: 65535,
            font_size: 3,
            brightness: 0.,
            contrast: 0.,
            invert: false,
            opacity: 100.,
        }
    }
    fn run(source: &SourceImage, s: StyleSettings, work: u32) -> Vec<u8> {
        let mut j = DitherJob::new(source, s, 0).unwrap();
        j.configure_context(crate::style_context::StyleContext {
            backdrop: 2,
            ..Default::default()
        });
        assert_eq!(j.step(source, 0).unwrap(), JobStatus::Pending);
        let mut n = 0;
        while j.step(source, work).unwrap() != JobStatus::Complete {
            n += 1;
            assert!(n < 100000);
        }
        j.take_frame().unwrap().rgba
    }
    #[test]
    fn reference_original_samples_source_and_none_clears_dither_input() {
        let source = SourceImage::new(1, 1, vec![255, 255, 255, 127], MAX_SOURCE_BYTES).unwrap();
        for (backdrop, expected) in [(0, vec![0, 0, 0, 0]), (2, vec![255, 255, 255, 127])] {
            let mut job = DitherJob::new(
                &source,
                settings(
                    1,
                    1,
                    DitherSettings {
                        strength: 0.,
                        ..d()
                    },
                ),
                0,
            )
            .unwrap();
            job.configure_context(crate::style_context::StyleContext {
                backdrop,
                ..Default::default()
            });
            while job.step(&source, 1).unwrap() != JobStatus::Complete {}
            assert_eq!(
                job.take_frame().unwrap().rgba,
                expected,
                "backdrop {backdrop}"
            );
        }
    }
    #[test]
    fn reference_default_backdrop_samples_source_before_dithering() {
        let source = SourceImage::new(
            2,
            1,
            vec![255, 255, 255, 127, 255, 255, 255, 255],
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        let s = settings(
            2,
            1,
            DitherSettings {
                strength: 0.,
                ..d()
            },
        );
        let mut job = DitherJob::new(&source, s.clone(), 0).unwrap();
        while job.step(&source, 1).unwrap() != JobStatus::Complete {}
        assert_eq!(job.take_frame().unwrap().rgba, run(&source, s, 1));
    }
    #[test]
    fn reference_solid_backdrop_is_dither_input() {
        let source = SourceImage::new(2, 1, [255; 4].repeat(2), MAX_SOURCE_BYTES).unwrap();
        let mut job = DitherJob::new(&source, settings(2, 1, d()), 0).unwrap();
        job.configure_context(crate::style_context::StyleContext {
            backdrop: 1,
            ..Default::default()
        });
        while job.step(&source, 1).unwrap() != JobStatus::Complete {}
        assert_eq!(
            job.take_frame().unwrap().rgba,
            vec![0, 0, 0, 255, 0, 0, 0, 255]
        );
    }
    #[test]
    fn reference_zero_strength_still_quantizes_for_every_algorithm() {
        let source = SourceImage::new(1, 1, vec![90, 100, 110, 255], MAX_SOURCE_BYTES).unwrap();
        for algorithm in 0..15 {
            let out = run(
                &source,
                settings(
                    1,
                    1,
                    DitherSettings {
                        algorithm,
                        strength: 0.,
                        ..d()
                    },
                ),
                1,
            );
            assert_eq!(out, vec![0, 0, 0, 255], "algorithm {algorithm}");
        }
    }
    #[test]
    fn reference_strength_scales_diffusion_error_and_keeps_palette_output() {
        let source =
            SourceImage::new(3, 3, [100, 100, 100, 255].repeat(9), MAX_SOURCE_BYTES).unwrap();
        for algorithm in 11..15 {
            let mut job = DitherJob::new(
                &source,
                settings(
                    3,
                    3,
                    DitherSettings {
                        algorithm,
                        strength: 50.,
                        ..d()
                    },
                ),
                0,
            )
            .unwrap();
            while !job.painting {
                job.step(&source, 1).unwrap();
            }
            assert_eq!(job.color, [0, 0, 0, 255]);
            for &(dx, dy, weight) in kernel(algorithm) {
                if dx >= 0 && dx < 3 {
                    assert_eq!(
                        job.errors[dy * 3 + dx as usize],
                        [(100. + 50. * weight) as f32; 3]
                    );
                }
            }
        }
    }
    #[test]
    fn reference_diffusion_starts_odd_rows_at_right_edge() {
        let source =
            SourceImage::new(3, 2, [100, 100, 100, 255].repeat(6), MAX_SOURCE_BYTES).unwrap();
        let mut job = DitherJob::new(&source, settings(3, 2, d()), 0).unwrap();
        while job.y == 0 {
            job.step(&source, 1).unwrap();
        }
        assert_eq!(job.x, 2);
    }
    #[test]
    fn bayer_permutations_and_palette_ties() {
        for n in [2, 4, 8, 16] {
            let mut ranks: Vec<_> = (0..n * n).map(|i| bayer(i % n, i / n, n)).collect();
            ranks.sort();
            assert_eq!(ranks, (0..n * n).collect::<Vec<_>>());
        }
        assert_eq!(
            [
                bayer(0, 0, 2),
                bayer(1, 0, 2),
                bayer(0, 1, 2),
                bayer(1, 1, 2)
            ],
            [0, 2, 3, 1]
        );
        assert_eq!(quantize([127.5; 3], &[[255; 3], [0; 3]], 0), [255.; 3]);
        assert_eq!(quantize([127.5; 3], &[[255; 3], [0; 3]], 2), [0.; 3]);
        assert_eq!(palette(&DitherSettings { palette: 14, ..d() }).len(), 256);
    }
    #[test]
    fn every_algorithm_is_chunk_deterministic_and_preserves_alpha() {
        let bytes: Vec<_> = (0..37 * 29)
            .flat_map(|i| {
                [
                    (i * 31 % 256) as u8,
                    (i * 71 % 256) as u8,
                    (i * 13 % 256) as u8,
                    if i % 5 == 0 { 0 } else { 137 },
                ]
            })
            .collect();
        let source = SourceImage::new(37, 29, bytes, MAX_SOURCE_BYTES).unwrap();
        let mut outputs = Vec::new();
        for algorithm in 0..15 {
            let s = settings(
                37,
                29,
                DitherSettings {
                    algorithm,
                    palette: 13,
                    ..d()
                },
            );
            let a = run(&source, s.clone(), 1);
            assert_eq!(a, run(&source, s.clone(), 7));
            assert_eq!(a, run(&source, s, 4096));
            for (i, p) in a.chunks(4).enumerate() {
                assert_eq!(p[3], if i % 5 == 0 { 0 } else { 137 });
                if p[3] == 0 {
                    assert_eq!(p, [0; 4]);
                }
            }
            outputs.push(a);
        }
        for i in 0..15 {
            for j in i + 1..15 {
                assert_ne!(outputs[i], outputs[j], "algorithms {i},{j}");
            }
        }
    }
    #[test]
    fn strength_zero_quantizes_tone_and_ignores_hidden_rgb() {
        let source = SourceImage::new(
            3,
            1,
            vec![255, 0, 0, 0, 0, 0, 255, 255, 11, 22, 33, 127],
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        let s = settings(
            3,
            1,
            DitherSettings {
                strength: 0.,
                contrast: 200.,
                pixel_size: 2,
                ..d()
            },
        );
        let out = run(&source, s, 1);
        assert!(out.chunks_exact(4).all(|p| p[..3] == [0, 0, 0] && p[3] > 0));
        let replacement = SourceImage::new(
            3,
            1,
            vec![0, 255, 0, 0, 0, 0, 255, 255, 11, 22, 33, 127],
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        assert_eq!(
            out,
            run(
                &replacement,
                settings(
                    3,
                    1,
                    DitherSettings {
                        strength: 0.,
                        contrast: 200.,
                        pixel_size: 2,
                        ..d()
                    }
                ),
                1
            )
        );
    }
    #[test]
    fn transparent_cell_keeps_error_and_threshold_bias_is_before_quantization() {
        let source = SourceImage::new(
            3,
            1,
            vec![100, 100, 100, 255, 255, 0, 0, 0, 100, 100, 100, 255],
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        let out = run(&source, settings(3, 1, d()), 1);
        assert_eq!(out, vec![0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255]);
        assert_eq!(
            run(
                &source,
                settings(
                    3,
                    1,
                    DitherSettings {
                        threshold: 0.,
                        ..d()
                    }
                ),
                7
            )[0],
            0
        );
    }
    #[test]
    fn transparent_cell_propagates_error_but_emits_clear_rgba() {
        let source = SourceImage::new(
            3,
            1,
            vec![120, 120, 120, 255, 255, 17, 99, 0, 110, 110, 110, 255],
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        // 120 -> 0 sends 52.5 into the transparent cell; it sends 22.96875
        // onward, so the final 110 crosses the mono palette boundary.
        assert_eq!(
            run(&source, settings(3, 1, d()), 1),
            vec![0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]
        );
    }
    #[test]
    fn full_plane_float32_oracles_cross_recycled_rows_with_fractional_bias() {
        let rgba: Vec<u8> = (0..19)
            .flat_map(|y| {
                (0..31).flat_map(move |x| {
                    [
                        (x * 29 + y * 17) % 256,
                        (x * 11 + y * 37) % 256,
                        (x * 47 + y * 7) % 256,
                        (x * 13 + y * 31) % 256,
                    ]
                    .map(|v| v as u8)
                })
            })
            .collect();
        let source = SourceImage::new(31, 19, rgba, MAX_SOURCE_BYTES).unwrap();
        for (algorithm, strength, expected) in [
            (
                11,
                50.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-floyd-50.rgba"
                )
                .as_slice(),
            ),
            (
                11,
                100.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-floyd-100.rgba"
                )
                .as_slice(),
            ),
            (
                12,
                50.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-atkinson-50.rgba"
                )
                .as_slice(),
            ),
            (
                12,
                100.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-atkinson-100.rgba"
                )
                .as_slice(),
            ),
            (
                13,
                50.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-stucki-50.rgba"
                )
                .as_slice(),
            ),
            (
                13,
                100.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-stucki-100.rgba"
                )
                .as_slice(),
            ),
            (
                14,
                50.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-sierraLite-50.rgba"
                )
                .as_slice(),
            ),
            (
                14,
                100.,
                include_bytes!(
                    "../../../tests/fixtures/render/dither/diffusion-odd31-sierraLite-100.rgba"
                )
                .as_slice(),
            ),
        ] {
            let settings = settings(
                31,
                19,
                DitherSettings {
                    algorithm,
                    strength,
                    pixel_size: 2,
                    contrast: 110.,
                    threshold: 37.,
                    ..d()
                },
            );
            for work in [1, 7, 4096] {
                assert_eq!(
                    run(&source, settings.clone(), work),
                    expected,
                    "algorithm {algorithm}, strength {strength}, work {work}"
                );
            }
        }
    }
    #[test]
    fn prepared_small_scale4_pixel12_keeps_sampler_stack_admitted() {
        let source =
            SourceImage::new(16, 16, [120, 100, 80, 255].repeat(256), MAX_SOURCE_BYTES).unwrap();
        let mut s = settings(
            64,
            64,
            DitherSettings {
                pixel_size: 12,
                ..d()
            },
        );
        s.scale = 4;
        let mut job = DitherJob::new(&source, s, 0).unwrap();
        job.configure_context(crate::style_context::StyleContext::default());
        while job.step(&source, 4096).unwrap() != JobStatus::Complete {}
        assert_eq!(job.take_frame().unwrap().rgba.len(), 64 * 64 * 4);
    }
    #[test]
    fn independent_canvas_backdrop_inputs_are_exact_before_quantization() {
        let rgba: Vec<u8> = (0..64)
            .flat_map(|y| {
                (0..128).flat_map(move |x| {
                    [2 * x, 4 * y, 255 - 2 * x, if x < 13 { 0 } else { 255 }].map(|v| v as u8)
                })
            })
            .collect();
        let source = SourceImage::new(128, 64, rgba, MAX_SOURCE_BYTES).unwrap();
        let mut failures = 0;
        for (backdrop, opacity, scale, expected) in [
            (
                3,
                100.,
                1,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur8-1.rgba")
                    .as_slice(),
            ),
            (
                3,
                100.,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur8-2.rgba")
                    .as_slice(),
            ),
            (
                2,
                50.,
                1,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-original50-1.rgba")
                    .as_slice(),
            ),
            (
                2,
                50.,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-original50-2.rgba")
                    .as_slice(),
            ),
            (
                3,
                50.,
                1,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur50-1.rgba")
                    .as_slice(),
            ),
            (
                3,
                50.,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur50-2.rgba")
                    .as_slice(),
            ),
            (
                2,
                30.,
                1,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-original30-1.rgba")
                    .as_slice(),
            ),
            (
                2,
                30.,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-original30-2.rgba")
                    .as_slice(),
            ),
            (
                3,
                30.,
                1,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur30-1.rgba")
                    .as_slice(),
            ),
            (
                3,
                30.,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur30-2.rgba")
                    .as_slice(),
            ),
            (
                2,
                70.,
                1,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-original70-1.rgba")
                    .as_slice(),
            ),
            (
                2,
                70.,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-original70-2.rgba")
                    .as_slice(),
            ),
            (
                3,
                70.,
                1,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur70-1.rgba")
                    .as_slice(),
            ),
            (
                3,
                70.,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/backdrop-blur70-2.rgba")
                    .as_slice(),
            ),
        ] {
            let mut s = settings(
                128 * scale,
                64 * scale,
                DitherSettings {
                    pixel_size: 2,
                    contrast: 110.,
                    ..d()
                },
            );
            s.scale = scale;
            let mut job = DitherJob::new(&source, s, 0).unwrap();
            job.configure_context(crate::style_context::StyleContext {
                backdrop,
                background_opacity: opacity,
                ..Default::default()
            });
            while !job.input_ready {
                job.step(&source, 1).unwrap();
            }
            let mut actual = Vec::new();
            for y in 0..64 * scale {
                for x in 0..128 * scale {
                    actual.extend(job.composer.input_pixel(x as usize, y as usize, opacity));
                }
            }
            assert_eq!(actual.len(), expected.len());
            let first = actual.iter().zip(expected).position(|(a, b)| a != b);
            if first.is_some() {
                failures += 1;
                eprintln!(
                    "backdrop {backdrop}, opacity {opacity}, scale {scale}: {first:?} {:?} vs {:?}",
                    first.map(|i| actual[i]),
                    first.map(|i| expected[i])
                );
            }
        }
        assert_eq!(failures, 0);
    }
    #[test]
    fn partial_alpha_backdrop_starts_with_decoded_premultiplied_bytes() {
        let source = SourceImage::new(4, 4, [200, 0, 0, 200].repeat(16), MAX_SOURCE_BYTES).unwrap();
        for scale in [1, 2] {
            let mut s = settings(4 * scale, 4 * scale, d());
            s.scale = scale;
            let mut job = DitherJob::new(&source, s, 0).unwrap();
            job.configure_context(crate::style_context::StyleContext {
                backdrop: 2,
                background_opacity: 50.,
                ..Default::default()
            });
            while !job.input_ready {
                job.step(&source, 1).unwrap();
            }
            assert_eq!(job.composer.input_pixel(0, 0, 50.), [79, 0, 0, 255]);
        }
    }
    #[test]
    fn bounded_rows_exact_budget_and_cancel() {
        let source = SourceImage::new(17, 13, vec![127; 17 * 13 * 4], MAX_SOURCE_BYTES).unwrap();
        let s = settings(17, 13, d());
        let peak = DitherJob::estimated_peak_bytes(&source, &s, 0).unwrap();
        let exact = SourceImage::new(17, 13, source.rgba().to_vec(), peak).unwrap();
        let mut j = DitherJob::new(&exact, s.clone(), 0).unwrap();
        assert_eq!(j.errors.len(), 17 * 3);
        j.step(&exact, 7).unwrap();
        j.cancel();
        assert_eq!(j.storage_bytes(), 0);
        let short = SourceImage::new(17, 13, source.rgba().to_vec(), peak - 1).unwrap();
        assert!(matches!(
            DitherJob::new(&short, s, 0),
            Err(RenderError::BudgetExceeded)
        ));
    }
    #[test]
    fn blue_noise_matches_owned_seeded_highpass_oracle() {
        let bytes = tables::BLUE_NOISE;
        assert_eq!(bytes.len(), 128 * 128);
        assert_eq!(bytes.iter().copied().min(), Some(0));
        assert_eq!(bytes.iter().copied().max(), Some(255));
        for (x, y) in [(0, 0), (7, 3), (127, 127), (128, 128), (129, 130)] {
            assert_eq!(
                pattern(
                    &DitherSettings {
                        algorithm: 10,
                        ..d()
                    },
                    x,
                    y,
                    999
                ),
                bytes[(y % 128) * 128 + x % 128] as f64 / 255.
            );
        }
    }
    #[test]
    fn wire_roundtrip_and_rejects_malformed_animation_custom_and_numbers() {
        for palette in [0, 15] {
            let s = settings(
                2,
                2,
                DitherSettings {
                    palette,
                    custom: if palette == 15 {
                        vec![[1, 2, 3], [200, 201, 202]]
                    } else {
                        vec![[0; 3], [255; 3]]
                    },
                    ..d()
                },
            );
            let b = super::super::wire::encode_style_settings(&s).unwrap();
            assert_eq!(super::super::wire::decode_style_settings(&b).unwrap(), s);
            for offset in [164, 168, 180] {
                let mut bad = b.clone();
                bad[offset] = 1;
                assert!(super::super::wire::decode_style_settings(&bad).is_err());
            }
            for offset in [112, 116, 120, 124, 160, 172, 176] {
                let mut bad = b.clone();
                bad[offset..offset + 4].copy_from_slice(&u32::MAX.to_le_bytes());
                assert!(super::super::wire::decode_style_settings(&bad).is_err());
            }
        }
    }
    #[test]
    fn kernel_impulse_weights_and_luminance_per_channel_rules() {
        assert_eq!(kernel(11).iter().map(|v| v.2).sum::<f64>(), 1.);
        assert_eq!(kernel(12).iter().map(|v| v.2).sum::<f64>(), 0.75);
        assert!((kernel(13).iter().map(|v| v.2).sum::<f64>() - 1.).abs() < 1e-12);
        assert_eq!(kernel(14).iter().map(|v| v.2).sum::<f64>(), 1.);
        assert_eq!(
            quantize([255., 0., 255.], &[[255, 255, 0], [0, 0, 255]], 2),
            [255., 0., 255.]
        );
        assert_eq!(quantize([200., 0., 0.], &[[0; 3], [255; 3]], 1), [0.; 3]);
    }
    #[test]
    fn named_palette_fixture_is_exact_and_custom_boundaries_are_closed() {
        let text =
            include_str!("../../../docs/research/ascii-magic/2026-10-27/dither-palettes.json");
        let text = text
            .split("\"palettes\": {")
            .nth(1)
            .unwrap()
            .split("\"original\"")
            .next()
            .unwrap();
        let numbers: Vec<u8> = text
            .split(|c: char| !c.is_ascii_digit())
            .filter(|v| !v.is_empty())
            .filter_map(|v| v.parse().ok())
            .collect();
        // Palette names contain numeric suffixes; compare each literal block independently.
        for (i, name) in [
            "mono",
            "grey4",
            "rgb3",
            "gameboy",
            "cga0",
            "cga1",
            "pico8",
            "c64",
            "nes16",
            "cyberpunk",
            "pastel",
            "riso",
            "sepia",
            "grey8",
        ]
        .iter()
        .enumerate()
        {
            let start = text.find(&format!("\"{name}\": [")).unwrap();
            let part = &text[start + name.len() + 5..];
            let mut depth = 1;
            let mut end = 0;
            for (j, c) in part.char_indices() {
                if c == '[' {
                    depth += 1;
                }
                if c == ']' {
                    depth -= 1;
                    if depth == 0 {
                        end = j;
                        break;
                    }
                }
            }
            let fixture: Vec<u8> = part[..end]
                .split(|c: char| !c.is_ascii_digit())
                .filter(|v| !v.is_empty())
                .map(|v| v.parse().unwrap())
                .collect();
            assert_eq!(
                fixture,
                tables::PALETTES[i]
                    .iter()
                    .flatten()
                    .copied()
                    .collect::<Vec<_>>(),
                "{name}"
            );
        }
        assert!(!numbers.is_empty());
        for count in [0, 1, 65] {
            assert!(!DitherSettings {
                custom: vec![[0; 3]; count],
                ..d()
            }
            .validate());
        }
        assert!(DitherSettings {
            custom: vec![[0; 3]; 64],
            ..d()
        }
        .validate());
        assert_eq!(quantize([127.5; 3], &[[255; 3], [0; 3]], 1), [255.; 3]);
        assert_eq!(quantize([127.5; 3], &[[255; 3], [0; 3]], 2), [0.; 3]);
        assert_eq!(
            quantize(
                [130., 70., 200.],
                &palette(&DitherSettings { palette: 14, ..d() }),
                0
            ),
            [146., 73., 170.]
        );
    }
    #[test]
    fn diffusion_impulses_clip_borders_keep_f32_and_scale_error() {
        let source =
            SourceImage::new(3, 3, [100, 100, 100, 255].repeat(9), MAX_SOURCE_BYTES).unwrap();
        for algorithm in 11..15 {
            let mut job = DitherJob::new(
                &source,
                settings(3, 3, DitherSettings { algorithm, ..d() }),
                0,
            )
            .unwrap();
            while !job.painting {
                job.step(&source, 1).unwrap();
            }
            let mut expected = vec![[100f32; 3]; 9];
            expected[0] = [0.; 3];
            for &(dx, dy, w) in kernel(algorithm) {
                if dx >= 0 && dx < 3 {
                    expected[dy * 3 + dx as usize] = [(100. + 100. * w) as f32; 3];
                }
            }
            assert_eq!(job.errors, expected, "kernel {algorithm}");
            let mut half = DitherJob::new(
                &source,
                settings(
                    3,
                    3,
                    DitherSettings {
                        algorithm,
                        strength: 50.,
                        ..d()
                    },
                ),
                0,
            )
            .unwrap();
            while !half.painting {
                half.step(&source, 1).unwrap();
            }
            assert_eq!(
                half.errors,
                expected
                    .iter()
                    .enumerate()
                    .map(|(i, v)| if i == 0 {
                        [0.; 3]
                    } else {
                        v.map(|c| (100. + (c as f64 - 100.) * 0.5) as f32)
                    })
                    .collect::<Vec<_>>()
            );
            assert_eq!(half.color, [0, 0, 0, 255]);
        }
    }
    #[test]
    fn source_identity_partial_cells_crop_rotation_and_scale() {
        let source = SourceImage::new(
            3,
            2,
            vec![
                10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255, 130, 140,
                150, 255, 160, 170, 180, 255,
            ],
            MAX_SOURCE_BYTES,
        )
        .unwrap();
        let mut s = settings(
            3,
            2,
            DitherSettings {
                strength: 0.,
                pixel_size: 2,
                ..d()
            },
        );
        let expected = vec![
            0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
        ];
        assert_eq!(run(&source, s.clone(), 1), expected);
        s.crop.x = 1. / 3.;
        s.crop.width = 2. / 3.;
        s.rotation = 90;
        s.scale = 2;
        s.width = 4;
        s.height = 4;
        let out = run(&source, s.clone(), 7);
        assert!(out.chunks(4).all(|p| p == [0, 0, 0, 255]));
        let mut j = DitherJob::new(&source, s, 0).unwrap();
        let replacement = SourceImage::new(3, 2, source.rgba().to_vec(), MAX_SOURCE_BYTES).unwrap();
        assert_eq!(j.step(&replacement, 1), Err(RenderError::MissingSource));
        assert_eq!(j.storage_bytes(), 0);
    }
    #[test]
    fn shared_binary_packets_reencode_exactly() {
        let text = include_str!("../../../tests/fixtures/render/styles/dither-wire-v1.json");
        for part in text.split("\"hex\": \"").skip(1) {
            let hex = part.split('"').next().unwrap();
            let bytes: Vec<u8> = (0..hex.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                .collect();
            let s = super::super::wire::decode_style_settings(&bytes).unwrap();
            assert_eq!(
                super::super::wire::encode_style_settings(&s).unwrap(),
                bytes
            );
            s.validate_source(2, 2).unwrap();
        }
    }
    #[test]
    fn direct_invalid_native_settings_and_reservation_overflow_return_errors() {
        let source =
            SourceImage::new(2, 2, [100, 100, 100, 255].repeat(4), MAX_SOURCE_BYTES).unwrap();
        for invalid in [
            settings(
                2,
                2,
                DitherSettings {
                    pixel_size: 0,
                    ..d()
                },
            ),
            StyleSettings {
                scale: 0,
                ..settings(2, 2, d())
            },
            StyleSettings {
                width: u32::MAX,
                height: u32::MAX,
                ..settings(2, 2, d())
            },
        ] {
            assert_eq!(
                DitherJob::estimated_peak_bytes(&source, &invalid, 0),
                Err(RenderError::InvalidInput)
            );
            assert!(matches!(
                DitherJob::new(&source, invalid, 0),
                Err(RenderError::InvalidInput)
            ));
        }
        let s = settings(2, 2, d());
        assert_eq!(
            DitherJob::estimated_peak_bytes(&source, &s, usize::MAX),
            Err(RenderError::BudgetExceeded)
        );
        assert!(matches!(
            DitherJob::new(&source, s, usize::MAX),
            Err(RenderError::BudgetExceeded)
        ));
    }
}
