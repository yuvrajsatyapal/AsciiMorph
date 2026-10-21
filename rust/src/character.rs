//! Validated version-one character settings shared by the native and WASM paths.
use std::fmt;
pub const MAX_SOURCE_DIMENSION: u32 = 16_384;
pub const MAX_SOURCE_BYTES: usize = 268_435_456;
pub const MAX_CHARACTER_CELLS: usize = 60_000;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderError {
    InvalidInput,
    UnsupportedVersion,
    BudgetExceeded,
    MissingSource,
    MissingCalibration,
    Cancelled,
    Disposed,
}
impl fmt::Display for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for RenderError {}
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Crop {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorMode {
    Monochrome,
    Grayscale,
    Color,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mapping {
    Glyph,
    Braille,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dither {
    None,
    FloydSteinberg,
}
#[derive(Debug, Clone, PartialEq)]
pub struct CharacterSettings {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub cell_width: f64,
    pub cell_height: f64,
    pub crop: Crop,
    pub rotation: u16,
    pub brightness: f64,
    pub contrast: f64,
    pub gamma: f64,
    pub saturation: f64,
    pub density: f64,
    pub sharpness: f64,
    pub edge: f64,
    pub shape_aware: bool,
    pub smart_edges: bool,
    pub mapping_invert: bool,
    pub output_invert: bool,
    pub mode: ColorMode,
    pub fg: u32,
    pub bg: Option<u32>,
    pub mapping: Mapping,
    pub dither: Dither,
    pub seed: u32,
}
impl CharacterSettings {
    pub fn new(width: u32, height: u32) -> Result<Self, RenderError> {
        let settings = Self {
            version: 1,
            width,
            height,
            cell_width: 10.0,
            cell_height: 18.0,
            crop: Crop {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
            rotation: 0,
            brightness: 0.0,
            contrast: 0.0,
            gamma: 1.0,
            saturation: 100.0,
            density: 1.0,
            sharpness: 0.0,
            edge: 0.0,
            shape_aware: false,
            smart_edges: false,
            mapping_invert: false,
            output_invert: false,
            mode: ColorMode::Monochrome,
            fg: 0xffffff,
            bg: None,
            mapping: Mapping::Glyph,
            dither: Dither::None,
            seed: 0,
        };
        settings.validate()?;
        Ok(settings)
    }
    pub fn validate(&self) -> Result<(), RenderError> {
        if self.version != 1 {
            return Err(RenderError::UnsupportedVersion);
        }
        checked_cells(
            self.width as usize,
            self.height as usize,
            MAX_CHARACTER_CELLS,
        )?;
        let c = self.crop;
        for (v, min, max) in [
            (self.cell_width, 1.0, 512.0),
            (self.cell_height, 1.0, 512.0),
            (c.x, 0.0, 1.0),
            (c.y, 0.0, 1.0),
            (c.width, 0.0, 1.0),
            (c.height, 0.0, 1.0),
            (self.brightness, -100.0, 100.0),
            (self.contrast, -100.0, 100.0),
            (self.gamma, 0.1, 3.0),
            (self.saturation, 0.0, 200.0),
            (self.density, 0.25, 3.0),
            (self.sharpness, 0.0, 100.0),
            (self.edge, 0.0, 100.0),
        ] {
            if !v.is_finite() || v < min || v > max {
                return Err(RenderError::InvalidInput);
            }
        }
        if c.width <= 0.0
            || c.height <= 0.0
            || c.x + c.width > 1.000001
            || c.y + c.height > 1.000001
            || ![0, 90, 180, 270].contains(&self.rotation)
            || self.fg > 0xffffff
            || self.bg.is_some_and(|v| v > 0xffffff)
        {
            return Err(RenderError::InvalidInput);
        }
        Ok(())
    }
    pub fn sample_dimensions(&self) -> Result<(usize, usize), RenderError> {
        self.validate()?;
        let (x, y) = if self.mapping == Mapping::Braille {
            (2, 4)
        } else {
            (1, 1)
        };
        Ok((
            (self.width as usize)
                .checked_mul(x)
                .ok_or(RenderError::BudgetExceeded)?,
            (self.height as usize)
                .checked_mul(y)
                .ok_or(RenderError::BudgetExceeded)?,
        ))
    }
}
pub(crate) fn checked_cells(w: usize, h: usize, limit: usize) -> Result<usize, RenderError> {
    if w == 0 || h == 0 {
        return Err(RenderError::InvalidInput);
    }
    w.checked_mul(h)
        .filter(|&n| n <= limit)
        .ok_or(RenderError::InvalidInput)
}

use crate::{
    color::{luminance, tone},
    glyph::{DirectionalIndices, GlyphCalibration},
    source::{geometry, Geometry, SourceImage},
};
pub const TRANSPARENT_GLYPH_INDEX: u16 = 65535;
/// Numeric packed grid. The browser/session supplies the calibration ID and glyph strings.
/// Braille indices are masks (Unicode code point = 0x2800 + index).
#[derive(Debug, Clone, PartialEq)]
pub struct GlyphGrid {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub cell_width: f64,
    pub cell_height: f64,
    pub glyph_indices: Vec<u16>,
    pub foreground: Vec<u8>,
    pub background: Vec<u8>,
    pub alpha: Vec<f32>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Pending,
    Complete,
    Cancelled,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stage {
    Sample,
    Tone,
    Filter,
    ShapeSample,
    ShapeTone,
    Map,
    Pack,
    Done,
    Cancelled,
}
/// Cursor over one area sample. Every call consumes exactly one source-pixel contribution.
#[derive(Debug, Default)]
struct AreaCursor {
    started: bool,
    x: usize,
    y: usize,
    x0: f64,
    x1: f64,
    y0: f64,
    y1: f64,
    sum: [f64; 5],
}
impl AreaCursor {
    fn contribution(
        &mut self,
        source: &SourceImage,
        g: Geometry,
        rotation: u16,
        index: usize,
        w: usize,
        h: usize,
    ) -> Option<[f64; 4]> {
        if !self.started {
            self.x0 = (index % w) as f64 * g.width as f64 / w as f64;
            self.x1 = (index % w + 1) as f64 * g.width as f64 / w as f64;
            self.y0 = (index / w) as f64 * g.height as f64 / h as f64;
            self.y1 = (index / w + 1) as f64 * g.height as f64 / h as f64;
            self.x = self.x0.floor() as usize;
            self.y = self.y0.floor() as usize;
            self.sum = [0.; 5];
            self.started = true;
        }
        let x = self.x;
        let y = self.y;
        let weight = ((x + 1) as f64).min(self.x1) - (x as f64).max(self.x0);
        let weight = weight * (((y + 1) as f64).min(self.y1) - (y as f64).max(self.y0));
        let (sx, sy) = match rotation {
            90 => (y, g.crop_height - 1 - x),
            180 => (g.crop_width - 1 - x, g.crop_height - 1 - y),
            270 => (g.crop_width - 1 - y, x),
            _ => (x, y),
        };
        let offset = ((g.y + sy) * source.width() as usize + g.x + sx) * 4;
        let p = &source.rgba()[offset..offset + 4];
        let a = p[3] as f64 / 255.;
        for (channel, value) in p.iter().take(3).enumerate() {
            self.sum[channel] += *value as f64 * a * weight;
        }
        self.sum[3] += a * weight;
        self.sum[4] += weight;
        self.x += 1;
        if self.x >= self.x1.ceil() as usize {
            self.x = self.x0.floor() as usize;
            self.y += 1;
        }
        if self.y >= self.y1.ceil() as usize {
            self.started = false;
            let alpha = self.sum[3];
            Some([
                if alpha > 0. { self.sum[0] / alpha } else { 0. },
                if alpha > 0. { self.sum[1] / alpha } else { 0. },
                if alpha > 0. { self.sum[2] / alpha } else { 0. },
                self.sum[3] / self.sum[4],
            ])
        } else {
            None
        }
    }
}
/// Cooperative renderer. `new` only validates/preallocates; source and calibration must retain
/// their backing allocations until completion. `step(0)` is a no-op. Each work unit is one
/// area contribution, tone sample, gradient neighbor, candidate bin, or packed output cell.
#[derive(Debug)]
pub struct CharacterJob {
    settings: CharacterSettings,
    g: Geometry,
    sw: usize,
    sh: usize,
    source_identity: (usize, u32, u32),
    calibration_identity: Option<(usize, usize, usize, Option<DirectionalIndices>)>,
    stage: Stage,
    index: usize,
    cursor: AreaCursor,
    pixel: [f64; 4],
    rgb: Vec<f32>,
    alpha: Vec<f32>,
    values: Vec<f32>,
    filtered: Vec<f32>,
    directions: Vec<u16>,
    mapped: Vec<u16>,
    targets: Vec<f64>,
    neighbor: usize,
    gradient: [f64; 3],
    candidate: usize,
    bin: usize,
    score: f64,
    best_score: f64,
    best: u16,
    density_best: u16,
    density_score: f64,
    grid: Option<GlyphGrid>,
}
impl CharacterJob {
    /// Numeric job vectors only; callers add retained inputs and serialization peaks.
    pub fn required_storage_bytes(settings: &CharacterSettings) -> Result<usize, RenderError> {
        let (w, h) = settings.sample_dimensions()?;
        let cells = settings.width as usize * settings.height as usize;
        let targets = if settings.shape_aware && settings.mapping == Mapping::Glyph {
            cells * 9
        } else {
            0
        };
        w.checked_mul(h)
            .and_then(|n| n.checked_mul(28))
            .and_then(|n| n.checked_add(targets * 8))
            .and_then(|n| n.checked_add(cells * 14))
            .ok_or(RenderError::BudgetExceeded)
    }
    pub fn new(
        source: &SourceImage,
        settings: CharacterSettings,
        calibration: Option<&GlyphCalibration>,
    ) -> Result<Self, RenderError> {
        settings.validate()?;
        let g = geometry(source, &settings)?;
        let (sw, sh) = settings.sample_dimensions()?;
        if settings.mapping == Mapping::Glyph {
            let c = calibration.ok_or(RenderError::MissingCalibration)?;
            if settings.smart_edges && c.directions.is_none() {
                return Err(RenderError::MissingCalibration);
            }
        }
        let n = sw * sh;
        let cells = settings.width as usize * settings.height as usize;
        let targets = if settings.shape_aware && settings.mapping == Mapping::Glyph {
            cells * 9
        } else {
            0
        };
        let bytes = source
            .storage_bytes()
            .checked_add(calibration.map_or(0, |c| c.storage_bytes()))
            .and_then(|v| v.checked_add(Self::required_storage_bytes(&settings).ok()?))
            .ok_or(RenderError::BudgetExceeded)?;
        if bytes > source.budget() {
            return Err(RenderError::BudgetExceeded);
        }
        let grid = GlyphGrid {
            version: 1,
            width: settings.width,
            height: settings.height,
            cell_width: settings.cell_width,
            cell_height: settings.cell_height,
            glyph_indices: vec![TRANSPARENT_GLYPH_INDEX; cells],
            foreground: vec![0; cells * 4],
            background: vec![0; cells * 4],
            alpha: vec![0.; cells],
        };
        let job = Self {
            settings,
            g,
            sw,
            sh,
            source_identity: (
                source.rgba().as_ptr() as usize,
                source.width(),
                source.height(),
            ),
            calibration_identity: calibration.map(|c| c.identity()),
            stage: Stage::Sample,
            index: 0,
            cursor: AreaCursor::default(),
            pixel: [0.; 4],
            rgb: vec![0.; n * 3],
            alpha: vec![0.; n],
            values: vec![0.; n],
            filtered: vec![0.; n],
            directions: vec![TRANSPARENT_GLYPH_INDEX; n],
            mapped: vec![0; n],
            targets: vec![0.; targets],
            neighbor: 0,
            gradient: [0.; 3],
            candidate: 0,
            bin: 0,
            score: 0.,
            best_score: f64::INFINITY,
            best: 0,
            density_best: 0,
            density_score: f64::INFINITY,
            grid: Some(grid),
        };
        // Capacities, rather than lengths, account for every retained vector allocation.
        if source.storage_bytes()
            + calibration.map_or(0, |c| c.storage_bytes())
            + job.storage_bytes()
            > source.budget()
        {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(job)
    }
    pub fn storage_bytes(&self) -> usize {
        let mut bytes = (self.rgb.capacity()
            + self.alpha.capacity()
            + self.values.capacity()
            + self.filtered.capacity())
            * 4
            + self.targets.capacity() * 8
            + (self.directions.capacity() + self.mapped.capacity()) * 2;
        if let Some(g) = &self.grid {
            bytes += g.glyph_indices.capacity() * 2
                + g.foreground.capacity()
                + g.background.capacity()
                + g.alpha.capacity() * 4;
        }
        bytes
    }
    pub fn cancel(&mut self) {
        if self.stage != Stage::Done {
            self.stage = Stage::Cancelled;
            self.grid = None;
        }
    }
    pub fn status(&self) -> JobStatus {
        match self.stage {
            Stage::Done => JobStatus::Complete,
            Stage::Cancelled => JobStatus::Cancelled,
            _ => JobStatus::Pending,
        }
    }
    /// Available once after completion; cancellation never yields a partial grid.
    pub fn take_grid(&mut self) -> Option<GlyphGrid> {
        if self.stage == Stage::Done {
            self.grid.take()
        } else {
            None
        }
    }
    pub fn step(
        &mut self,
        source: &SourceImage,
        calibration: Option<&GlyphCalibration>,
        max_work: u32,
    ) -> Result<JobStatus, RenderError> {
        if self.status() != JobStatus::Pending {
            return Ok(self.status());
        }
        if self.source_identity
            != (
                source.rgba().as_ptr() as usize,
                source.width(),
                source.height(),
            )
        {
            return Err(RenderError::MissingSource);
        }
        if self.calibration_identity != calibration.map(|c| c.identity()) {
            return Err(RenderError::MissingCalibration);
        }
        for _ in 0..max_work {
            if self.status() != JobStatus::Pending {
                break;
            }
            self.work(source, calibration);
        }
        Ok(self.status())
    }
    fn work(&mut self, source: &SourceImage, calibration: Option<&GlyphCalibration>) {
        let n = self.sw * self.sh;
        match self.stage {
            Stage::Sample => {
                if let Some(p) = self.cursor.contribution(
                    source,
                    self.g,
                    self.settings.rotation,
                    self.index,
                    self.sw,
                    self.sh,
                ) {
                    self.pixel = p;
                    self.stage = Stage::Tone;
                }
            }
            Stage::Tone => {
                let p = self.pixel;
                let gray = luminance(p[0], p[1], p[2]);
                let mut rgb = [0.; 3];
                for k in 0..3 {
                    rgb[k] = tone(
                        gray + (p[k] - gray) * self.settings.saturation / 100.,
                        self.settings.brightness,
                        self.settings.contrast,
                        self.settings.gamma,
                    );
                    self.rgb[self.index * 3 + k] = rgb[k] as f32;
                }
                self.alpha[self.index] = p[3] as f32;
                let l = luminance(rgb[0], rgb[1], rgb[2]);
                self.values[self.index] = if self.settings.mapping_invert {
                    255. - l
                } else {
                    l
                } as f32;
                self.index += 1;
                if self.index == n {
                    self.index = 0;
                    self.stage = Stage::Filter
                } else {
                    self.stage = Stage::Sample
                }
            }
            Stage::Filter => self.filter_neighbor(),
            Stage::ShapeSample => {
                let w = self.sw * 3;
                let h = self.sh * 3;
                let cell = self.index / 9;
                let bin = self.index % 9;
                let index = (cell / self.sw * 3 + bin / 3) * w + cell % self.sw * 3 + bin % 3;
                if let Some(p) =
                    self.cursor
                        .contribution(source, self.g, self.settings.rotation, index, w, h)
                {
                    self.pixel = p;
                    self.stage = Stage::ShapeTone;
                }
            }
            Stage::ShapeTone => {
                let p = self.pixel;
                let v = tone(
                    luminance(p[0], p[1], p[2]),
                    self.settings.brightness,
                    self.settings.contrast,
                    self.settings.gamma,
                );
                self.targets[self.index] = (if self.settings.mapping_invert {
                    255. - v
                } else {
                    v
                }) / 255.
                    * p[3];
                self.index += 1;
                if self.index == self.targets.len() {
                    self.index = 0;
                    self.stage = Stage::Map
                } else {
                    self.stage = Stage::ShapeSample
                }
            }
            Stage::Map => self.map_candidate(calibration),
            Stage::Pack => {
                self.pack();
                self.index += 1;
                if self.index == self.settings.width as usize * self.settings.height as usize {
                    self.stage = Stage::Done
                }
            }
            Stage::Done | Stage::Cancelled => {}
        }
    }
    fn filter_neighbor(&mut self) {
        let x = (self.index % self.sw) as isize;
        let y = (self.index / self.sw) as isize;
        let dx = (self.neighbor % 3) as isize - 1;
        let dy = (self.neighbor / 3) as isize - 1;
        let v = self.values[(y + dy).clamp(0, self.sh as isize - 1) as usize * self.sw
            + (x + dx).clamp(0, self.sw as isize - 1) as usize] as f64;
        self.gradient[0] += v / 9.;
        self.gradient[1] += v * [-1., 0., 1., -2., 0., 2., -1., 0., 1.][self.neighbor];
        self.gradient[2] += v * [-1., -2., -1., 0., 0., 0., 1., 2., 1.][self.neighbor];
        self.neighbor += 1;
        if self.neighbor == 9 {
            let [blur, gx, gy] = self.gradient;
            let v = self.values[self.index] as f64;
            let magnitude = gx.hypot(gy);
            let sharp = (v + (v - blur) * self.settings.sharpness / 25.).clamp(0., 255.);
            self.filtered[self.index] = (255.
                * ((sharp * (1. - self.settings.edge / 100.)
                    + magnitude.clamp(0., 255.) * self.settings.edge / 100.)
                    .clamp(0., 255.)
                    / 255.)
                    .powf(self.settings.density)) as f32;
            if self.settings.smart_edges
                && self.settings.mapping == Mapping::Glyph
                && magnitude >= 100.
            {
                let angle = (gy.atan2(gx).to_degrees() + 180.) % 180.;
                self.directions[self.index] = if !(22.5..157.5).contains(&angle) {
                    0
                } else if angle < 67.5 {
                    1
                } else if angle < 112.5 {
                    2
                } else {
                    3
                };
            }
            self.index += 1;
            self.neighbor = 0;
            self.gradient = [0.; 3];
            if self.index == self.sw * self.sh {
                self.index = 0;
                self.stage = if self.targets.is_empty() {
                    Stage::Map
                } else {
                    Stage::ShapeSample
                };
            }
        }
    }
    fn map_candidate(&mut self, calibration: Option<&GlyphCalibration>) {
        let value = (self.filtered[self.index] as f64).clamp(0., 255.);
        if self.alpha[self.index] == 0. {
            self.mapped[self.index] = TRANSPARENT_GLYPH_INDEX;
            self.finish_map();
            return;
        }
        if self.settings.mapping == Mapping::Braille {
            let dot = value >= 127.5;
            self.mapped[self.index] = dot as u16;
            if self.settings.dither == Dither::FloydSteinberg {
                crate::dither::diffuse(
                    &mut self.filtered,
                    self.sw,
                    self.sh,
                    self.index,
                    value - if dot { 255. } else { 0. },
                );
            }
            self.finish_map();
            return;
        }
        let c = calibration.expect("validated calibration identity");
        let j = self.candidate;
        if self.bin == 0 {
            let distance = (c.coverage[j] as f64 - value / 255.).abs();
            if distance < self.density_score {
                self.density_score = distance;
                self.density_best = j as u16;
            }
            self.score = 0.;
        }
        if !self.targets.is_empty() {
            let delta = c.shapes[j * 9 + self.bin] as f64 - self.targets[self.index * 9 + self.bin];
            self.score += delta * delta;
            self.bin += 1;
            if self.bin < 9 {
                return;
            }
        }
        let score = if self.targets.is_empty() {
            (c.coverage[j] as f64 - value / 255.).abs()
        } else {
            // Preserve JS operation order as well as f32 boundaries: sum all
            // nine squares, divide once, then add the coverage penalty.
            self.score / 9. + (c.coverage[j] as f64 - value / 255.).abs() * 0.3
        };
        if score < self.best_score {
            self.best_score = score;
            self.best = j as u16;
        }
        self.bin = 0;
        self.candidate += 1;
        if self.candidate == c.glyph_count as usize {
            let direction = self.directions[self.index];
            self.mapped[self.index] = if direction == TRANSPARENT_GLYPH_INDEX {
                self.best
            } else {
                let d = c.directions.expect("validated directional metadata");
                [d.vertical, d.slash, d.horizontal, d.backslash][direction as usize]
            };
            if self.settings.dither == Dither::FloydSteinberg {
                crate::dither::diffuse(
                    &mut self.filtered,
                    self.sw,
                    self.sh,
                    self.index,
                    value - c.coverage[self.density_best as usize] as f64 * 255.,
                );
            }
            self.finish_map();
        }
    }
    fn finish_map(&mut self) {
        self.index += 1;
        self.candidate = 0;
        self.bin = 0;
        self.score = 0.;
        self.best_score = f64::INFINITY;
        self.density_score = f64::INFINITY;
        self.best = 0;
        self.density_best = 0;
        if self.index == self.sw * self.sh {
            self.index = 0;
            self.stage = Stage::Pack;
        }
    }
    fn pack(&mut self) {
        let braille = self.settings.mapping == Mapping::Braille;
        let (w, h) = if braille { (2, 4) } else { (1, 1) };
        let x = self.index % self.settings.width as usize;
        let y = self.index / self.settings.width as usize;
        let mut a = 0.;
        let mut rgb = [0.; 3];
        let mut mask = 0u16;
        for dy in 0..h {
            for dx in 0..w {
                let i = (y * h + dy) * self.sw + x * w + dx;
                let alpha = self.alpha[i] as f64;
                a += alpha;
                for (k, v) in rgb.iter_mut().enumerate() {
                    *v += self.rgb[i * 3 + k] as f64 * alpha;
                }
                if braille && self.mapped[i] == 1 {
                    mask |= 1 << [[0, 3], [1, 4], [2, 5], [6, 7]][dy][dx];
                }
            }
        }
        if a > 0. {
            for v in &mut rgb {
                *v /= a;
            }
        }
        let alpha = (a / (w * h) as f64) as f32;
        let gray = luminance(rgb[0], rgb[1], rgb[2]);
        let fg = match self.settings.mode {
            ColorMode::Monochrome => [
                (self.settings.fg >> 16) as f64,
                ((self.settings.fg >> 8) & 255) as f64,
                (self.settings.fg & 255) as f64,
            ],
            ColorMode::Grayscale => [gray; 3],
            ColorMode::Color => rgb,
        };
        let grid = self.grid.as_mut().expect("grid retained until completion");
        let offset = self.index * 4;
        grid.glyph_indices[self.index] = if alpha == 0. {
            TRANSPARENT_GLYPH_INDEX
        } else if braille {
            mask
        } else {
            self.mapped[self.index]
        };
        grid.alpha[self.index] = alpha;
        for (k, v) in fg.iter().enumerate() {
            let v = v.round().clamp(0., 255.) as u8;
            grid.foreground[offset + k] = if self.settings.output_invert {
                255 - v
            } else {
                v
            };
        }
        grid.foreground[offset + 3] = (alpha as f64 * 255.).round() as u8;
        if alpha > 0. {
            if let Some(bg) = self.settings.bg {
                for (k, shift) in [16, 8, 0].iter().enumerate() {
                    let v = ((bg >> shift) & 255) as u8;
                    grid.background[offset + k] = if self.settings.output_invert {
                        255 - v
                    } else {
                        v
                    };
                }
                grid.background[offset + 3] = 255;
            }
        }
    }
}
