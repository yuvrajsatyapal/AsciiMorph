//! Independent deterministic palette dithering. Sampling and painting are cooperative;
//! diffusion retains exactly three rows, and palette storage is bounded at 256 colors.
use super::{
    compose::FrameComposer,
    contract::{DitherSettings, Family, StyleSettings},
    geometry::FrameGeometry,
    sampling::AreaSampler,
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
fn hash(x: i64, y: i64, seed: u32) -> u32 {
    let mut v = (x as u32).wrapping_mul(0x9e3779b9) ^ (y as u32).wrapping_mul(0x85ebca6b) ^ seed;
    v ^= v >> 16;
    v = v.wrapping_mul(0x7feb352d);
    v ^= v >> 15;
    v = v.wrapping_mul(0x846ca68b);
    v ^ (v >> 16)
}
fn pattern(d: &DitherSettings, x: usize, y: usize, seed: u32) -> f64 {
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
            let x = ix.rem_euclid(8) as usize;
            let y = iy.rem_euclid(8) as usize;
            let dist = |x: usize, y: usize| (2 * x as i32 - 7).pow(2) + (2 * y as i32 - 7).pow(2);
            let target = (dist(x, y), y * 8 + x);
            let rank = (0..64)
                .filter(|i| (dist(i % 8, i / 8), *i) < target)
                .count();
            (rank as f64 + 0.5) / 64.
        }
        5 => {
            let dx = xx.rem_euclid(8.) - 4.;
            let dy = yy.rem_euclid(8.) - 4.;
            (dx.hypot(dy) / 4.).fract()
        }
        6 => yy.rem_euclid(8.) / 8.,
        7 => xx.rem_euclid(8.) / 8.,
        8 => (xx + yy).rem_euclid(8.) / 8.,
        9 => (hash(ix, iy, seed) as f64 + 0.5) / 4294967296.,
        10 => {
            (tables::BLUE_RANKS[iy.rem_euclid(16) as usize * 16 + ix.rem_euclid(16) as usize]
                as f64
                + 0.5)
                / 256.
        }
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
    x: usize,
    y: usize,
    sampler: Option<AreaSampler>,
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
        let cols = (s.width as usize).div_ceil(pitch);
        let rows = (s.height as usize).div_ceil(pitch);
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
        let composer = FrameComposer::new(source, s.clone(), layer, composer_other)?;
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
            x: 0,
            y: 0,
            sampler: None,
            color: [0; 4],
            paint: 0,
            painting: false,
            done: false,
            cancelled: false,
            context: crate::style_context::StyleContext::default(),
        })
    }
    fn pitch(&self) -> usize {
        self.d.pixel_size as usize * self.settings.scale as usize
    }
    fn bounds(&self) -> [usize; 4] {
        let p = self.pitch();
        [
            self.x * p,
            self.y * p,
            ((self.x + 1) * p).min(self.settings.width as usize),
            ((self.y + 1) * p).min(self.settings.height as usize),
        ]
    }
    fn finish_sample(&mut self) {
        let sample = self.sampler.take().unwrap().sample();
        let row = self.y % 3;
        let ei = row * self.cols + self.x;
        let incoming = self.errors[ei];
        self.errors[ei] = [0.; 3];
        let mut out = sample.rgb;
        if sample.alpha > 0. && self.d.strength > 0. {
            let base = sample
                .rgb
                .map(|v| ((v - 127.5) * self.d.contrast / 100. + 127.5).clamp(0., 255.));
            let bias = 255.
                * (if self.d.algorithm < 11 {
                    pattern(&self.d, self.x, self.y, self.settings.seed)
                } else {
                    0.5
                } - self.d.threshold / 100.);
            let input = std::array::from_fn(|k| {
                base[k]
                    + bias
                    + if self.d.algorithm >= 11 {
                        incoming[k] as f64
                    } else {
                        0.
                    }
            });
            let q = quantize(input, &self.palette, self.d.chroma);
            if self.d.algorithm >= 11 {
                let mut error = std::array::from_fn::<_, 3, _>(|k| input[k] - q[k]);
                if self.d.chroma == 1 {
                    error = [luma(input) - luma(q); 3];
                }
                for &(dx, dy, w) in kernel(self.d.algorithm) {
                    let x = self.x as isize + dx;
                    if x >= 0 && (x as usize) < self.cols && self.y + dy < self.rows {
                        let i = ((self.y + dy) % 3) * self.cols + x as usize;
                        for k in 0..3 {
                            self.errors[i][k] = (self.errors[i][k] as f64 + error[k] * w) as f32;
                        }
                    }
                }
            }
            out = std::array::from_fn(|k| base[k] + (q[k] - base[k]) * self.d.strength / 100.);
        }
        self.color = [byte(out[0]), byte(out[1]), byte(out[2]), byte(sample.alpha)];
        if sample.alpha == 0. || !self.context.occupied(self.x, self.y) {
            self.color = [0; 4];
        }
        self.paint = 0;
        self.painting = true;
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
                    self.x += 1;
                    if self.x == self.cols {
                        self.x = 0;
                        self.y += 1;
                    }
                    self.done = self.y == self.rows;
                }
                continue;
            }
            if self.sampler.is_none() {
                let b = self.bounds();
                let scale = self.settings.scale as f64;
                let mut a = AreaSampler::new(
                    b[0] as f64 / scale,
                    b[1] as f64 / scale,
                    b[2] as f64 / scale,
                    b[3] as f64 / scale,
                )?;
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
        if self.done {
            self.composer.step(source, remaining)
        } else {
            Ok(JobStatus::Pending)
        }
    }
    pub fn configure_context(&mut self, c: crate::style_context::StyleContext) {
        self.context = c;
        self.composer.configure_context(c)
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
mod tests {
    use super::*;
    fn d() -> DitherSettings {
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
    fn settings(w: u32, h: u32, d: DitherSettings) -> StyleSettings {
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
            backdrop: 0,
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
    fn strength_zero_ignores_tone_and_hidden_rgb() {
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
        assert_eq!(out, vec![0, 0, 255, 128, 0, 0, 255, 128, 11, 22, 33, 127]);
    }
    #[test]
    fn transparent_cell_absorbs_error_and_threshold_bias_is_before_quantization() {
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
            255
        );
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
    fn blue_noise_is_permutation_with_suppressed_low_frequencies() {
        let mut tile = tables::BLUE_RANKS;
        tile.sort();
        assert_eq!(tile, std::array::from_fn(|i| i as u8));
        fn energy(v: &[f64]) -> f64 {
            let mut energy = 0.;
            for fy in -2i32..=2 {
                for fx in -2i32..=2 {
                    if fx == 0 && fy == 0 {
                        continue;
                    }
                    let (mut re, mut im) = (0., 0.);
                    for y in 0..16 {
                        for x in 0..16 {
                            let a =
                                2. * std::f64::consts::PI * (fx * x as i32 + fy * y as i32) as f64
                                    / 16.;
                            re += v[y * 16 + x] * a.cos();
                            im += v[y * 16 + x] * a.sin();
                        }
                    }
                    energy += re * re + im * im;
                }
            }
            energy
        }
        let blue: Vec<_> = tables::BLUE_RANKS
            .iter()
            .map(|v| if *v < 128 { 1. } else { 0. })
            .collect();
        let white: Vec<_> = (0..256)
            .map(|i| {
                if hash((i % 16) as i64, (i / 16) as i64, 123) < u32::MAX / 2 {
                    1.
                } else {
                    0.
                }
            })
            .collect();
        let b = energy(&blue);
        let w = energy(&white);
        println!("blue low-frequency energy={b}, white={w}");
        assert!(b < w * 0.5);
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
    fn diffusion_impulses_clip_borders_keep_f32_and_strength_does_not_change_error() {
        let source =
            SourceImage::new(3, 3, [100, 100, 100, 255].repeat(9), MAX_SOURCE_BYTES).unwrap();
        for algorithm in 11..15 {
            let mut job = DitherJob::new(
                &source,
                settings(3, 3, DitherSettings { algorithm, ..d() }),
                0,
            )
            .unwrap();
            job.step(&source, 1).unwrap();
            let mut expected = vec![[0f32; 3]; 9];
            for &(dx, dy, w) in kernel(algorithm) {
                if dx >= 0 && dx < 3 {
                    expected[dy * 3 + dx as usize] = [(100. * w) as f32; 3];
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
            half.step(&source, 1).unwrap();
            assert_eq!(half.errors, expected);
            assert_eq!(half.color, [50, 50, 50, 255]);
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
            70, 80, 90, 255, 70, 80, 90, 255, 115, 125, 135, 255, 70, 80, 90, 255, 70, 80, 90, 255,
            115, 125, 135, 255,
        ];
        assert_eq!(run(&source, s.clone(), 1), expected);
        s.crop.x = 1. / 3.;
        s.crop.width = 2. / 3.;
        s.rotation = 90;
        s.scale = 2;
        s.width = 4;
        s.height = 4;
        let out = run(&source, s.clone(), 7);
        assert!(out.chunks(4).all(|p| p == [100, 110, 120, 255]));
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
