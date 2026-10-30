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
    // Canonical software WebGL sampler uses nearest 1/16 texture weights.
    // Keep the historical exact sampler for requests without captured context.
    fn software_webgl_alpha(&self, index: u16, x: f64, y: f64) -> f32 {
        let (ix, iy) = (x.floor() as isize, y.floor() as isize);
        let fx = ((x - x.floor()) * 16.).round_ties_even() / 16.;
        let fy = ((y - y.floor()) * 16.).round_ties_even() / 16.;
        // SwiftShader interpolates RGBA8 byte values, then normalizes in float32.
        // Normalizing each tap in f64 first loses the upward half-byte boundary.
        let tap = |x, y| (self.alpha(index, x, y) * 255.).round();
        let byte = tap(ix, iy) * (1. - fx) * (1. - fy)
            + tap(ix + 1, iy) * fx * (1. - fy)
            + tap(ix, iy + 1) * (1. - fx) * fy
            + tap(ix + 1, iy + 1) * fx * fy;
        byte as f32 * (1f32 / 255.)
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
    context: Option<crate::style_context::StyleContext>,
    batch: Option<Box<crate::webgl_glyph::Batch>>,
    batch_allowance: usize,
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
            context: None,
            batch: None,
            batch_allowance: budget - peak,
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
            + self
                .batch
                .as_ref()
                .map_or(0, |_| std::mem::size_of::<crate::webgl_glyph::Batch>())
    }
    pub fn status(&self) -> JobStatus {
        match self.stage {
            Stage::Done => JobStatus::Complete,
            Stage::Cancelled => JobStatus::Cancelled,
            _ => JobStatus::Pending,
        }
    }
    pub fn cancel(&mut self) {
        self.batch = None;
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
        if p[3] > 0 || self.context.is_some() {
            // Canvas image-data readback normalizes fully transparent RGB to
            // black, and these probes still participate in the captured range.
            let l = if p[3] == 0 { 0. } else { luma(p) };
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
    pub(crate) fn configure_context(&mut self, c: crate::style_context::StyleContext) {
        self.context = Some(c);
    }
    pub(crate) fn configure_webgl_batch(
        &mut self,
        atlas: &ReferenceAtlas,
    ) -> Result<(), RenderError> {
        let batch = crate::webgl_glyph::Batch::new(
            self.settings.font_size * self.settings.render_scale as f64,
        );
        if atlas.origin_x.fract() != 0.
            || atlas.origin_y.fract() != 0.
            || atlas.origin_x < -2.
            || atlas.origin_y < -2.
            || atlas.origin_x + atlas.width as f64 + 2. > batch.size[0] as f64
            || atlas.origin_y + atlas.height as f64 + 2. > batch.size[1] as f64
            || atlas.count as usize > (2048 / batch.size[0]) * (2048 / batch.size[1])
        {
            return Err(RenderError::InvalidInput);
        }
        if std::mem::size_of::<crate::webgl_glyph::Batch>() > self.batch_allowance {
            return Err(RenderError::BudgetExceeded);
        }
        self.batch = Some(Box::new(batch));
        Ok(())
    }
    fn select(&mut self, source: &SourceImage, atlas: &ReferenceAtlas) {
        let (column, row) = (self.cell % self.columns, self.cell / self.columns);
        let p = self.pixel(source, column, row);
        let span = if self.max == self.min {
            1.
        } else {
            self.max - self.min
        };
        let selected = if p[3] == 0 || self.context.is_some_and(|c| !c.occupied(column, row)) {
            None
        } else {
            ramp_index(((luma(p) - self.min) / span).clamp(0., 1.), atlas.count).map(|mut index| {
                if let Some(c) = self.context {
                    if c.invert {
                        index = atlas.count - 1 - index;
                    }
                    if c.random {
                        index = (c.hash(column, row) % atlas.count as u32) as u16;
                    }
                }
                index
            })
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
        if self.context.is_some() {
            // The batch uploads floating tone colors; postpone tone rounding to
            // the RGBA8 framebuffer, keeping raw source bytes here.
            self.color.copy_from_slice(&p[..3]);
        }
        self.anchor_x = column as f64 * self.settings.cell_width() + atlas.origin_x;
        self.anchor_y = row as f64 * self.settings.cell_height() + atlas.origin_y;
        if let Some(batch) = self.batch.as_mut() {
            let factor =
                259. * (self.settings.contrast + 255.) / (255. * (259. - self.settings.contrast));
            let colors = std::array::from_fn::<_, 4, _>(|k| {
                if k == 3 {
                    (self.opacity * self.context.unwrap().opacity / 100.) as f32
                } else {
                    ((factor * (self.color[k] as f64 - 128.)
                        + 128.
                        + 255. * self.settings.brightness / 100.)
                        .clamp(0., 255.)
                        / 255.) as f32
                }
            });
            batch.select(
                self.glyph,
                [
                    column as f64 * self.settings.cell_width(),
                    row as f64 * self.settings.cell_height(),
                ],
                [self.settings.frame_width, self.settings.frame_height],
                colors,
            );
        }
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
    fn paint_software_webgl(&mut self, atlas: &ReferenceAtlas) {
        let sample = self.batch.as_ref().map(|batch| {
            let values = batch.at(self.paint_x, self.paint_y);
            let tx = values[0] * 2048.
                - 0.5
                - (batch.slot[0] * batch.size[0] + 2) as f32
                - atlas.origin_x as f32;
            let ty = values[1] * 2048.
                - 0.5
                - (batch.slot[1] * batch.size[1] + 2) as f32
                - atlas.origin_y as f32;
            let ix = tx.floor() as isize;
            let iy = ty.floor() as isize;
            let fx = tx - tx.floor();
            let fy = ty - ty.floor();
            let tap = |x, y| (atlas.alpha(self.glyph, x, y) * 255.).round() as f32;
            let t0 = tap(ix, iy) + fx * (tap(ix + 1, iy) - tap(ix, iy));
            let t1 = tap(ix, iy + 1) + fx * (tap(ix + 1, iy + 1) - tap(ix, iy + 1));
            ((t0 + fy * (t1 - t0)) * (1f32 / 255.) * values[5], values)
        });
        let a = sample.map_or_else(
            || {
                atlas.software_webgl_alpha(
                    self.glyph,
                    self.paint_x as f64 - self.anchor_x,
                    self.paint_y as f64 - self.anchor_y,
                ) * (self.opacity * self.context.unwrap().opacity / 100.) as f32
            },
            |s| s.0,
        );
        let offset = (self.paint_y * self.settings.frame_width as usize + self.paint_x) * 4;
        let rgba = &mut self.layer.as_mut().unwrap().rgba;
        let dst_alpha = rgba[offset + 3];
        let alpha = (a * 255. + dst_alpha as f32 * (1. - a)).round_ties_even() as u8;
        for channel in 0..3 {
            let factor =
                259. * (self.settings.contrast + 255.) / (255. * (259. - self.settings.contrast));
            let tone = (factor * (self.color[channel] as f64 - 128.)
                + 128.
                + 255. * self.settings.brightness / 100.)
                .clamp(0., 255.);
            let color = sample.map_or((tone / 255.) as f32, |s| s.1[2 + channel]);
            let dst = (rgba[offset + channel] as f32 * dst_alpha as f32 / 255.).round();
            let premul = (color * a * 255. + dst * (1. - a)).round_ties_even();
            rgba[offset + channel] = if alpha == 0 {
                0
            } else {
                ((premul * (1. / 255.)) * (1. / (alpha as f32 * (1. / 255.))) * 255.)
                    .round_ties_even()
                    .clamp(0., 255.) as u8
            };
        }
        rgba[offset + 3] = alpha;
        self.paint_x += 1;
        if self.paint_x >= self.right {
            self.paint_x = self.left;
            self.paint_y += 1;
        }
        if self.paint_y >= self.bottom {
            self.next_cell();
        }
    }
    fn paint(&mut self, atlas: &ReferenceAtlas) {
        if self.context.is_some() {
            self.paint_software_webgl(atlas);
            return;
        }
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

#[cfg(test)]
mod context_parity_tests {
    use super::*;
    #[test]
    fn transparent_browser_pixels_participate_as_black_in_context_range() {
        let mut pixels = Vec::new();
        for _ in 0..3 {
            for x in 0..6 {
                pixels.extend(if x < 2 {
                    [255, 255, 255, 0]
                } else if x < 4 {
                    [100, 100, 100, 255]
                } else {
                    [200, 200, 200, 255]
                });
            }
        }
        let src = SourceImage::new(6, 3, pixels, MAX_SOURCE_BYTES).unwrap();
        let atlas = ReferenceAtlas::new(3, 1, 1, vec![255, 128, 0], 0., 0., 65535).unwrap();
        let s = ReferenceCharactersSettings {
            version: 1,
            frame_width: 6,
            frame_height: 3,
            font_size: 3.,
            render_scale: 1,
            brightness: 0.,
            contrast: 0.,
            rotation: 0,
            backdrop: ReferenceBackdrop::None,
            crop: crate::character::Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
        };
        let mut job = ReferenceCharactersJob::new(&src, s, &atlas, 0).unwrap();
        job.configure_context(crate::style_context::StyleContext::default());
        while job.step(&src, &atlas, 1).unwrap() == JobStatus::Pending {}
        let grid = job.take_glyph_layer().unwrap().grid.unwrap();
        assert_eq!(grid.glyph_indices, [65535, 1, 0]);
    }
}

#[cfg(test)]
mod webgl_parity_tests {
    use super::*;
    #[test]
    fn captured_font22_batch_matches_full_independent_gl_frame() {
        let mut pixels = Vec::new();
        for y in 0..64u8 {
            for x in 0..128u8 {
                pixels.extend([2 * x, 4 * y, 255 - 2 * x, if x < 13 { 0 } else { 255 }]);
            }
        }
        let source = SourceImage::new(128, 64, pixels, MAX_SOURCE_BYTES).unwrap();
        let atlas = ReferenceAtlas::new(
            14,
            14,
            22,
            include_bytes!("../../tests/fixtures/render/characters/font22-batch.mask").to_vec(),
            0.,
            0.,
            13,
        )
        .unwrap();
        let settings = ReferenceCharactersSettings {
            version: 1,
            frame_width: 256,
            frame_height: 128,
            font_size: 11.,
            render_scale: 2,
            brightness: 0.,
            contrast: 20.,
            rotation: 0,
            backdrop: ReferenceBackdrop::None,
            crop: Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
        };
        let mut job = ReferenceCharactersJob::new(&source, settings, &atlas, 0).unwrap();
        job.configure_context(crate::style_context::StyleContext {
            backdrop: 0,
            ..Default::default()
        });
        job.configure_webgl_batch(&atlas).unwrap();
        while job.step(&source, &atlas, 1).unwrap() == JobStatus::Pending {}
        let out = job.take_glyph_layer().unwrap().rgba;
        let expected = include_bytes!("../../tests/fixtures/render/characters/font22-batch.rgba");
        let first = out.iter().zip(expected).position(|(a, b)| a != b);
        assert!(
            first.is_none(),
            "first mismatch {:?}",
            first.map(|i| (i, out[i], expected[i]))
        );
    }
    #[test]
    fn sampler_normalization_matches_independent_rgba32f_readback() {
        // Chromium156 SwiftShader, RGBA8 LINEAR texture sampled into RGBA32F.
        // Probe includes a half-byte boundary that changes RGBA8 output.
        let mask = vec![0, 0, 0, 0, 0, 17, 139, 0, 0, 241, 53, 0, 0, 0, 0, 0];
        let atlas =
            ReferenceAtlas::new(2, 4, 4, [mask.clone(), mask].concat(), 0., 0., 65535).unwrap();
        for (x, y, expected) in [
            (1., 1., 0.06666667014360428f32),
            (1.5, 1., 0.30588236451148987),
            (1., 1.5, 0.5058823823928833),
            (1.5, 1.5, 0.44117650389671326),
            (1.3125, 1.6875, 0.5589154958724976),
        ] {
            assert_eq!(
                atlas.software_webgl_alpha(0, x, y).to_bits(),
                expected.to_bits(),
                "({x},{y})"
            );
        }
    }
    #[test]
    fn context_glyph_interpolation_equals_software_webgl_all_scales() {
        check(true, false);
    }
    #[test]
    fn context_glyph_premultiplied_color_equals_software_webgl_all_scales() {
        check(false, false);
    }
    #[test]
    fn context_webgl_layer_composes_exactly_onto_opaque_canvas() {
        check(false, true);
    }
    #[test]
    fn complete_context_grid_placement_clipping_and_overlap_equal_webgl() {
        let mask = [0, 0, 0, 0, 0, 17, 139, 0, 0, 241, 53, 0, 0, 0, 0, 0];
        let mut pixels = Vec::new();
        for _ in 0..3 {
            for x in 0..7 {
                pixels.extend(match x {
                    2 => [72, 160, 220, 212],
                    4 => [220, 99, 31, 173],
                    _ => [0, 0, 0, 255],
                });
            }
        }
        let source = SourceImage::new(7, 3, pixels, 268_435_456).unwrap();
        let expected = include_bytes!("../../tests/fixtures/render/characters/webgl-grid.rgba");
        let mut start = 0;
        for scale in 1..=4u8 {
            let side = 4 * scale as usize;
            let mask = (0..side * side)
                .map(|i| mask[i / side / scale as usize * 4 + i % side / scale as usize])
                .collect::<Vec<_>>();
            for (x, y) in [(-1.5, -0.6), (0., 0.), (0.4, 0.6), (3.6, 1.3)] {
                let atlas = ReferenceAtlas::new(
                    2,
                    side as u16,
                    side as u16,
                    [mask.clone(), mask.clone()].concat(),
                    x * scale as f64,
                    y * scale as f64,
                    65535,
                )
                .unwrap();
                let settings = ReferenceCharactersSettings {
                    version: 1,
                    frame_width: 7 * scale as u32,
                    frame_height: 3 * scale as u32,
                    font_size: 3.,
                    render_scale: scale,
                    brightness: 0.,
                    contrast: 20.,
                    rotation: 0,
                    crop: crate::character::Crop {
                        x: 0.,
                        y: 0.,
                        width: 1.,
                        height: 1.,
                    },
                    backdrop: ReferenceBackdrop::None,
                };
                let mut job = crate::character_backdrop::CompleteCharactersJob::new(
                    &source, settings, &atlas, 0,
                )
                .unwrap();
                job.configure_context(crate::style_context::StyleContext {
                    backdrop: 0,
                    ..Default::default()
                });
                while job.step(&source, &atlas, 1).unwrap() == JobStatus::Pending {}
                let out = job.take_frame().unwrap();
                for (i, (a, b)) in out
                    .rgba
                    .iter()
                    .zip(&expected[start..start + out.rgba.len()])
                    .enumerate()
                {
                    assert_eq!(a, b, "scale{scale}, origin({x},{y}) byte{i}");
                }
                start += out.rgba.len();
            }
        }
        assert_eq!(start, expected.len());
    }
    fn check(alpha_only: bool, opaque: bool) {
        let mask = vec![0, 0, 0, 0, 0, 17, 139, 0, 0, 241, 53, 0, 0, 0, 0, 0];

        let source = SourceImage::new(16, 8, [72, 160, 220, 212].repeat(128), 268_435_456).unwrap();
        let settings = ReferenceCharactersSettings {
            version: 1,
            frame_width: 16,
            frame_height: 8,
            font_size: 3.,
            render_scale: 1,
            brightness: 0.,
            contrast: 20.,
            rotation: 0,
            crop: crate::character::Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            backdrop: ReferenceBackdrop::None,
        };
        let expected: &[u8] = if opaque {
            include_bytes!("../../tests/fixtures/render/characters/webgl-software-opaque.rgba")
        } else {
            include_bytes!("../../tests/fixtures/render/characters/webgl-software.rgba")
        };
        let offsets = [
            (0., 0.3),
            (0.1, 0.3),
            (0.2, 0.3),
            (0.3, 0.3),
            (0.4, 0.3),
            (0.5, 0.3),
            (0.6, 0.3),
            (0.7, 0.3),
            (0.8, 0.3),
            (0.9, 0.3),
            (-1.7, -0.6),
            (13.4, 5.2),
            (0.03125, 0.96875),
        ];
        let mut start = 0;
        for opacity in [100., 50., 99., 0.] {
            for scale in 1..=4u8 {
                let side = 4 * scale as usize;
                let scaled = (0..side * side)
                    .map(|i| mask[(i / side / scale as usize) * 4 + i % side / scale as usize])
                    .collect::<Vec<_>>();
                let atlas = ReferenceAtlas::new(
                    2,
                    side as u16,
                    side as u16,
                    [scaled.clone(), scaled].concat(),
                    0.,
                    0.,
                    65535,
                )
                .unwrap();
                let mut settings = settings.clone();
                settings.frame_width *= scale as u32;
                settings.frame_height *= scale as u32;
                settings.render_scale = scale;
                let pixels = (settings.frame_width * settings.frame_height) as usize;
                for (case, (x, y)) in offsets.into_iter().enumerate() {
                    let mut job =
                        ReferenceCharactersJob::new(&source, settings.clone(), &atlas, 0).unwrap();
                    job.configure_context(crate::style_context::StyleContext {
                        opacity,
                        ..Default::default()
                    });
                    job.min = 0.;
                    job.max = 255.;
                    job.select(&source, &atlas);
                    job.anchor_x = x * scale as f64;
                    job.anchor_y = y * scale as f64;
                    job.left = 0;
                    job.right = settings.frame_width as usize;
                    job.bottom = settings.frame_height as usize;
                    job.paint_x = 0;
                    job.paint_y = 0;
                    for _ in 0..pixels {
                        job.paint(&atlas);
                    }
                    if opaque {
                        let c = crate::style_context::StyleContext {
                            opacity,
                            ..Default::default()
                        };
                        for pixel in job.layer.as_mut().unwrap().rgba.chunks_exact_mut(4) {
                            c.composite_webgl(pixel, [37., 91., 203., 1.]);
                        }
                    }
                    let actual = &job.layer.as_ref().unwrap().rgba;
                    for (i, (&a, &b)) in actual
                        .iter()
                        .zip(&expected[start..start + pixels * 4])
                        .enumerate()
                    {
                        if (i % 4 == 3) != alpha_only {
                            continue;
                        }
                        assert_eq!(
                            a,
                            b,
                            "scale {scale}, case {case}, pixel ({},{}), channel {}",
                            i / 4 % settings.frame_width as usize,
                            i / 4 / settings.frame_width as usize,
                            i % 4
                        );
                    }
                    start += pixels * 4;
                }
            }
        }
        assert_eq!(start, expected.len());
    }
}
