//! Independently specified Characters V1 glyph layer. This is not a complete blur-backed look.
//! Browser-owned strings and measured masks retain input order; coverage never selects glyphs.
//! Source lookup, raw tone, alpha-mask rasterization and frame composition are Rust-owned.
use crate::{
    character::{
        Crop, GlyphGrid, JobStatus, RenderError, MAX_CHARACTER_CELLS, MAX_SOURCE_BYTES,
        MAX_SOURCE_DIMENSION, TRANSPARENT_GLYPH_INDEX,
    },
    source::SourceImage,
};

const MAX_BACKING_PIXELS: usize = 32_000_000;
const MAX_ATLAS_BYTES: usize = 16 * 1024 * 1024;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReferenceBackdrop {
    None,
    Solid,
    Blur,
}
#[derive(Debug, Clone, PartialEq)]
pub struct ReferenceCharactersSettings {
    pub version: u32,
    pub frame_width: u32,
    pub frame_height: u32,
    pub font_size: f64,
    pub render_scale: u8,
    pub brightness: f64,
    pub contrast: f64,
    pub crop: Crop,
    pub rotation: u16,
    pub backdrop: ReferenceBackdrop,
}
impl ReferenceCharactersSettings {
    pub fn validate(&self) -> Result<(), RenderError> {
        if self.version != 1 {
            return Err(RenderError::UnsupportedVersion);
        }
        if self.frame_width == 0
            || self.frame_height == 0
            || self.frame_width > MAX_SOURCE_DIMENSION
            || self.frame_height > MAX_SOURCE_DIMENSION
            || self.frame_width as usize * self.frame_height as usize > MAX_BACKING_PIXELS
        {
            return Err(RenderError::InvalidInput);
        }
        let c = self.crop;
        for (v, lo, hi) in [
            (self.font_size, 3., 80.),
            (self.brightness, -100., 100.),
            (self.contrast, -100., 100.),
            (c.x, 0., 1.),
            (c.y, 0., 1.),
            (c.width, 0., 1.),
            (c.height, 0., 1.),
        ] {
            if !v.is_finite() || v < lo || v > hi {
                return Err(RenderError::InvalidInput);
            }
        }
        if !(1..=4).contains(&self.render_scale)
            || ![0, 90, 180, 270].contains(&self.rotation)
            || c.width <= 0.
            || c.height <= 0.
            || c.x + c.width > 1.
            || c.y + c.height > 1.
        {
            return Err(RenderError::InvalidInput);
        }
        if self
            .columns()
            .checked_mul(self.rows())
            .ok_or(RenderError::BudgetExceeded)?
            > MAX_CHARACTER_CELLS
        {
            return Err(RenderError::InvalidInput);
        }
        Ok(())
    }
    pub fn cell_width(&self) -> f64 {
        0.6 * self.font_size * self.render_scale as f64
    }
    pub fn cell_height(&self) -> f64 {
        self.font_size * self.render_scale as f64
    }
    fn columns(&self) -> usize {
        (self.frame_width as f64 / self.cell_width()).floor() as usize
    }
    fn rows(&self) -> usize {
        (self.frame_height as f64 / self.cell_height()).floor() as usize
    }
}
/// Atlas metadata is independent of legacy calibration. Masks are alpha planes in input order.
/// Origins may overhang either side, bounded by the actual measured shared rectangle dimensions.
#[derive(Debug)]
pub struct ReferenceAtlas {
    count: u16,
    width: u16,
    height: u16,
    masks: std::sync::Arc<Vec<u8>>,
    origin_x: f64,
    origin_y: f64,
    space_index: u16,
}
impl ReferenceAtlas {
    pub fn new(
        count: u16,
        width: u16,
        height: u16,
        masks: Vec<u8>,
        origin_x: f64,
        origin_y: f64,
        space_index: u16,
    ) -> Result<Self, RenderError> {
        let length = (width as usize)
            .checked_mul(height as usize)
            .and_then(|v| v.checked_mul(count as usize))
            .ok_or(RenderError::BudgetExceeded)?;
        if !(2..=256).contains(&count)
            || width == 0
            || height == 0
            || width as u32 > MAX_SOURCE_DIMENSION
            || height as u32 > MAX_SOURCE_DIMENSION
            || masks.len() != length
            || !origin_x.is_finite()
            || !origin_y.is_finite()
            || origin_x.abs() > width as f64
            || origin_y.abs() > height as f64
            || (space_index != TRANSPARENT_GLYPH_INDEX && space_index >= count)
        {
            return Err(RenderError::InvalidInput);
        }
        if masks.capacity() > MAX_ATLAS_BYTES {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(Self {
            count,
            width,
            height,
            masks: std::sync::Arc::new(masks),
            origin_x,
            origin_y,
            space_index,
        })
    }
    pub(crate) fn borrowed(
        calibration: &crate::glyph::GlyphCalibration,
        origin_x: f64,
        origin_y: f64,
        space_index: u16,
    ) -> Result<ReferenceAtlas, RenderError> {
        let width = calibration.mask_width;
        let height = calibration.mask_height;
        let count = calibration.glyph_count;
        if !origin_x.is_finite()
            || !origin_y.is_finite()
            || origin_x.abs() > width as f64
            || origin_y.abs() > height as f64
            || (space_index != TRANSPARENT_GLYPH_INDEX && space_index >= count)
        {
            return Err(RenderError::InvalidInput);
        }
        if calibration.masks.capacity() > MAX_ATLAS_BYTES {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(ReferenceAtlas {
            count,
            width,
            height,
            masks: std::sync::Arc::clone(&calibration.masks),
            origin_x,
            origin_y,
            space_index,
        })
    }
    pub fn storage_bytes(&self) -> usize {
        self.masks.capacity() + std::mem::size_of::<Self>() + 2 * std::mem::size_of::<usize>()
    }
    pub fn glyph_count(&self) -> u16 {
        self.count
    }
    pub(crate) fn dimensions(&self) -> (usize, usize) {
        (self.width as usize, self.height as usize)
    }
    pub(crate) fn validate_braille(
        &self,
        s: &crate::styles::contract::StyleSettings,
    ) -> Result<(), RenderError> {
        let stride = self.width as usize * self.height as usize;
        if self.count != 256
            || self.space_index != 65535
            || self.origin_x != s.atlas_origin_x
            || self.origin_y != s.atlas_origin_y
            || self.masks[..stride].iter().any(|&v| v != 0)
            || !self.masks[255 * stride..].iter().any(|&v| v != 0)
        {
            return Err(RenderError::InvalidInput);
        }
        Ok(())
    }
    pub(crate) fn identity(&self) -> (usize, u16, u16, u16, u64, u64, u16) {
        (
            self.masks.as_ptr() as usize,
            self.count,
            self.width,
            self.height,
            self.origin_x.to_bits(),
            self.origin_y.to_bits(),
            self.space_index,
        )
    }
    fn alpha(&self, index: u16, x: isize, y: isize) -> f64 {
        if x < 0 || y < 0 || x >= self.width as isize || y >= self.height as isize {
            return 0.;
        }
        self.masks[index as usize * self.width as usize * self.height as usize
            + y as usize * self.width as usize
            + x as usize] as f64
            / 255.
    }
    pub(crate) fn bilinear(&self, index: u16, x: f64, y: f64) -> f64 {
        let (ix, iy) = (x.floor() as isize, y.floor() as isize);
        let (fx, fy) = (x - x.floor(), y - y.floor());
        self.alpha(index, ix, iy) * (1. - fx) * (1. - fy)
            + self.alpha(index, ix + 1, iy) * fx * (1. - fy)
            + self.alpha(index, ix, iy + 1) * (1. - fx) * fy
            + self.alpha(index, ix + 1, iy + 1) * fx * fy
    }
}
/// Exact fixed darkThreshold30/edge0 policy. Input dictionary order is authoritative.
pub fn ramp_index(normalized: f64, count: u16) -> Option<u16> {
    if !normalized.is_finite() || !(2..=256).contains(&count) || normalized < 0.42 {
        return None;
    }
    Some((((1. - normalized.clamp(0., 1.)) * count as f64).floor() as u16).min(count - 1))
}
/// Raw reference affine stage: no legacy contrast conversion, gamma, or coverage adjustment.
pub fn reference_tone(channel: u8, brightness: f64, contrast: f64) -> u8 {
    let factor = 259. * (contrast + 255.) / (255. * (259. - contrast));
    (factor * (channel as f64 - 128.) + 128. + 255. * (brightness / 100.))
        .clamp(0., 255.)
        .round() as u8
}
#[derive(Debug, Clone, PartialEq)]
pub struct ReferenceGlyphLayer {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub grid: Option<GlyphGrid>,
}
impl ReferenceGlyphLayer {
    fn storage_bytes(&self) -> usize {
        self.rgba.capacity()
            + self.grid.as_ref().map_or(0, |g| {
                g.glyph_indices.capacity() * 2
                    + g.foreground.capacity()
                    + g.background.capacity()
                    + g.alpha.capacity() * 4
            })
    }
}
#[derive(Debug, Clone, Copy)]
pub(crate) struct Geometry {
    x: usize,
    y: usize,
    crop_width: usize,
    crop_height: usize,
    width: usize,
    height: usize,
}
pub(crate) fn geometry(
    source: &SourceImage,
    s: &ReferenceCharactersSettings,
) -> Result<Geometry, RenderError> {
    s.validate()?;
    crop_geometry(
        source,
        s.crop,
        s.rotation,
        s.frame_width,
        s.frame_height,
        s.render_scale,
    )
}
pub(crate) fn crop_geometry(
    source: &SourceImage,
    c: Crop,
    rotation: u16,
    frame_width: u32,
    frame_height: u32,
    scale: u8,
) -> Result<Geometry, RenderError> {
    let (iw, ih) = (source.width() as usize, source.height() as usize);
    let x = ((c.x * iw as f64).floor() as usize).min(iw);
    let y = ((c.y * ih as f64).floor() as usize).min(ih);
    let right = (((c.x + c.width) * iw as f64).ceil() as usize).min(iw);
    let bottom = (((c.y + c.height) * ih as f64).ceil() as usize).min(ih);
    if right <= x || bottom <= y {
        return Err(RenderError::InvalidInput);
    }
    let (crop_width, crop_height) = (right - x, bottom - y);
    let (width, height) = if rotation == 90 || rotation == 270 {
        (crop_height, crop_width)
    } else {
        (crop_width, crop_height)
    };
    if frame_width as usize != width * scale as usize
        || frame_height as usize != height * scale as usize
    {
        return Err(RenderError::InvalidInput);
    }
    Ok(Geometry {
        x,
        y,
        crop_width,
        crop_height,
        width,
        height,
    })
}
impl Geometry {
    pub(crate) fn pixel(&self, source: &SourceImage, rotation: u16, x: usize, y: usize) -> [u8; 4] {
        let (x, y) = (x.min(self.width - 1), y.min(self.height - 1));
        let (sx, sy) = match rotation {
            90 => (y, self.crop_height - 1 - x),
            180 => (self.crop_width - 1 - x, self.crop_height - 1 - y),
            270 => (self.crop_width - 1 - y, x),
            _ => (x, y),
        };
        let offset = ((self.y + sy) * source.width() as usize + self.x + sx) * 4;
        source.rgba()[offset..offset + 4]
            .try_into()
            .expect("validated source extent")
    }
    pub(crate) fn extent(&self) -> (usize, usize) {
        (self.width, self.height)
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stage {
    Probe,
    Select,
    Paint,
    Done,
    Cancelled,
}
/// Cooperative two-pass range/render job borrowing retained inputs each slice.
/// One work unit samples one probe/cell or composites one destination pixel (four fixed taps).
/// No transformed image/source clone, unbounded glyph loop, or numerical browser fallback.
#[derive(Debug)]
pub struct ReferenceCharactersJob {
    settings: ReferenceCharactersSettings,
    g: Geometry,
    columns: usize,
    rows: usize,
    stride: usize,
    source_identity: (usize, u32, u32, usize, usize),
    atlas_identity: (usize, u16, u16, u16, u64, u64, u16),
    stage: Stage,
    probe_x: usize,
    probe_y: usize,
    min: f64,
    max: f64,
    cell: usize,
    glyph: u16,
    color: [u8; 3],
    opacity: f64,
    anchor_x: f64,
    anchor_y: f64,
    paint_x: usize,
    paint_y: usize,
    left: usize,
    right: usize,
    bottom: usize,
    layer: Option<ReferenceGlyphLayer>,
}
impl ReferenceCharactersJob {
    /// Includes retained backing capacities, metadata, job vectors and a full serialization copy.
    /// `other_retained_bytes` charges other jobs/staging/retained calibration in the future session.
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        settings: &ReferenceCharactersSettings,
        atlas: &ReferenceAtlas,
        other_retained_bytes: usize,
    ) -> Result<usize, RenderError> {
        geometry(source, settings)?;
        if settings.backdrop != ReferenceBackdrop::None {
            return Err(RenderError::InvalidInput);
        }
        let frame = settings.frame_width as usize * settings.frame_height as usize;
        let cells = settings.columns() * settings.rows();
        source
            .storage_bytes()
            .checked_add(std::mem::size_of::<SourceImage>())
            .and_then(|v| v.checked_add(atlas.storage_bytes()))
            .and_then(|v| v.checked_add(std::mem::size_of::<Self>()))
            .and_then(|v| v.checked_add(frame.checked_mul(8)?))
            .and_then(|v| v.checked_add(cells.checked_mul(28)?))
            .and_then(|v| v.checked_add(160))
            .and_then(|v| v.checked_add(other_retained_bytes))
            .ok_or(RenderError::BudgetExceeded)
    }
    pub fn new(
        source: &SourceImage,
        settings: ReferenceCharactersSettings,
        atlas: &ReferenceAtlas,
        other_retained_bytes: usize,
    ) -> Result<Self, RenderError> {
        let peak = Self::estimated_peak_bytes(source, &settings, atlas, other_retained_bytes)?;
        let budget = source.budget().min(MAX_SOURCE_BYTES);
        if peak > budget {
            return Err(RenderError::BudgetExceeded);
        }
        let g = geometry(source, &settings)?;
        let (columns, rows) = (settings.columns(), settings.rows());
        let cells = columns * rows;
        let grid = if cells == 0 {
            None
        } else {
            Some(GlyphGrid {
                version: 1,
                width: columns as u32,
                height: rows as u32,
                cell_width: settings.cell_width(),
                cell_height: settings.cell_height(),
                glyph_indices: filled(cells, TRANSPARENT_GLYPH_INDEX)?,
                foreground: filled(cells * 4, 0)?,
                background: filled(cells * 4, 0)?,
                alpha: filled(cells, 0.)?,
            })
        };
        let layer = ReferenceGlyphLayer {
            version: 1,
            width: settings.frame_width,
            height: settings.frame_height,
            rgba: filled(
                settings.frame_width as usize * settings.frame_height as usize * 4,
                0,
            )?,
            grid,
        };
        // Check actual capacities as well as requested lengths before admitting the job.
        let requested =
            (settings.frame_width as usize * settings.frame_height as usize * 4) + cells * 14;
        if peak
            .checked_add(layer.storage_bytes().saturating_sub(requested) * 2)
            .ok_or(RenderError::BudgetExceeded)?
            > budget
        {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(Self {
            settings,
            g,
            columns,
            rows,
            stride: (columns.min(rows) / 40).max(1),
            source_identity: source_identity(source),
            atlas_identity: atlas.identity(),
            stage: if cells == 0 {
                Stage::Done
            } else {
                Stage::Probe
            },
            probe_x: 0,
            probe_y: 0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            cell: 0,
            glyph: 0,
            color: [0; 3],
            opacity: 0.,
            anchor_x: 0.,
            anchor_y: 0.,
            paint_x: 0,
            paint_y: 0,
            left: 0,
            right: 0,
            bottom: 0,
            layer: Some(layer),
        })
    }
    /// Heap allocations retained by this job; preflight also charges inline metadata/serialization.
    pub fn storage_bytes(&self) -> usize {
        self.layer.as_ref().map_or(0, |l| l.storage_bytes())
    }
    pub fn status(&self) -> JobStatus {
        match self.stage {
            Stage::Done => JobStatus::Complete,
            Stage::Cancelled => JobStatus::Cancelled,
            _ => JobStatus::Pending,
        }
    }
    pub fn cancel(&mut self) {
        if self.stage != Stage::Done {
            self.stage = Stage::Cancelled;
            self.layer = None;
        }
    }
    pub fn take_glyph_layer(&mut self) -> Option<ReferenceGlyphLayer> {
        if self.stage == Stage::Done {
            self.layer.take()
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
        if source_identity(source) != self.source_identity {
            return Err(RenderError::MissingSource);
        }
        if atlas.identity() != self.atlas_identity {
            return Err(RenderError::MissingCalibration);
        }
        for _ in 0..max_work {
            match self.stage {
                Stage::Probe => self.probe(source),
                Stage::Select => self.select(source, atlas),
                Stage::Paint => self.paint(atlas),
                Stage::Done | Stage::Cancelled => break,
            }
        }
        Ok(self.status())
    }
    fn pixel(&self, source: &SourceImage, column: usize, row: usize) -> [u8; 4] {
        let scale = self.settings.render_scale as f64;
        let x = (((column as f64 + 0.5) * self.settings.cell_width() / scale).floor() as usize)
            .min(self.g.width - 1);
        let y = (((row as f64 + 0.5) * self.settings.cell_height() / scale).floor() as usize)
            .min(self.g.height - 1);
        self.g.pixel(source, self.settings.rotation, x, y)
    }

    fn probe(&mut self, source: &SourceImage) {
        let p = self.pixel(source, self.probe_x, self.probe_y);
        if p[3] > 0 {
            let l = luma(p);
            self.min = self.min.min(l);
            self.max = self.max.max(l);
        }
        self.probe_x += self.stride;
        if self.probe_x >= self.columns {
            self.probe_x = 0;
            self.probe_y += self.stride;
        }
        if self.probe_y >= self.rows {
            if !self.min.is_finite() {
                self.min = 0.;
                self.max = 0.;
            }
            self.stage = Stage::Select;
        }
    }
    fn next_cell(&mut self) {
        self.cell += 1;
        self.stage = if self.cell >= self.columns * self.rows {
            Stage::Done
        } else {
            Stage::Select
        };
    }
    fn select(&mut self, source: &SourceImage, atlas: &ReferenceAtlas) {
        let (column, row) = (self.cell % self.columns, self.cell / self.columns);
        let p = self.pixel(source, column, row);
        let span = if self.max == self.min {
            1.
        } else {
            self.max - self.min
        };
        let selected = if p[3] == 0 {
            None
        } else {
            ramp_index(((luma(p) - self.min) / span).clamp(0., 1.), atlas.count)
        };
        let Some(index) = selected.filter(|&index| index != atlas.space_index) else {
            self.next_cell();
            return;
        };
        self.glyph = index;
        self.opacity = p[3] as f64 / 255.;
        self.color = [
            reference_tone(p[0], self.settings.brightness, self.settings.contrast),
            reference_tone(p[1], self.settings.brightness, self.settings.contrast),
            reference_tone(p[2], self.settings.brightness, self.settings.contrast),
        ];
        let grid = self.layer.as_mut().unwrap().grid.as_mut().unwrap();
        grid.glyph_indices[self.cell] = index;
        grid.alpha[self.cell] = self.opacity as f32;
        grid.foreground[self.cell * 4..self.cell * 4 + 4].copy_from_slice(&[
            self.color[0],
            self.color[1],
            self.color[2],
            p[3],
        ]);
        self.anchor_x = column as f64 * self.settings.cell_width() + atlas.origin_x;
        self.anchor_y = row as f64 * self.settings.cell_height() + atlas.origin_y;
        self.left = self
            .anchor_x
            .floor()
            .clamp(0., self.settings.frame_width as f64) as usize;
        self.paint_y = self
            .anchor_y
            .floor()
            .clamp(0., self.settings.frame_height as f64) as usize;
        self.right = (self.anchor_x + atlas.width as f64)
            .ceil()
            .clamp(0., self.settings.frame_width as f64) as usize;
        self.bottom = (self.anchor_y + atlas.height as f64)
            .ceil()
            .clamp(0., self.settings.frame_height as f64) as usize;
        self.paint_x = self.left;
        if self.left >= self.right || self.paint_y >= self.bottom {
            self.next_cell();
        } else {
            self.stage = Stage::Paint;
        }
    }
    fn paint(&mut self, atlas: &ReferenceAtlas) {
        // Destination/mask centers both have +.5; their difference cancels that offset.
        let a = atlas.bilinear(
            self.glyph,
            self.paint_x as f64 - self.anchor_x,
            self.paint_y as f64 - self.anchor_y,
        ) * self.opacity;
        if a > 0. {
            let offset = (self.paint_y * self.settings.frame_width as usize + self.paint_x) * 4;
            let rgba = &mut self.layer.as_mut().unwrap().rgba;
            let dst = rgba[offset + 3] as f64 / 255.;
            let alpha = a + dst * (1. - a);
            for channel in 0..3 {
                rgba[offset + channel] = ((self.color[channel] as f64 * a
                    + rgba[offset + channel] as f64 * dst * (1. - a))
                    / alpha)
                    .clamp(0., 255.)
                    .round() as u8;
            }
            rgba[offset + 3] = (alpha * 255.).round() as u8;
            if rgba[offset + 3] == 0 {
                rgba[offset..offset + 4].fill(0);
            }
        }
        self.paint_x += 1;
        if self.paint_x >= self.right {
            self.paint_x = self.left;
            self.paint_y += 1;
        }
        if self.paint_y >= self.bottom {
            self.next_cell();
        }
    }
}
fn luma(p: [u8; 4]) -> f64 {
    0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64
}
pub(crate) fn source_identity(s: &SourceImage) -> (usize, u32, u32, usize, usize) {
    (
        s.rgba().as_ptr() as usize,
        s.width(),
        s.height(),
        s.storage_bytes(),
        s.budget(),
    )
}
fn filled<T: Clone>(length: usize, value: T) -> Result<Vec<T>, RenderError> {
    let mut values = Vec::new();
    values
        .try_reserve_exact(length)
        .map_err(|_| RenderError::BudgetExceeded)?;
    values.resize(length, value);
    Ok(values)
}
