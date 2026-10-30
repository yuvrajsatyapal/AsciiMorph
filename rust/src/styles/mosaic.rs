//! Rounded square, wide and tall tiles with sparse base-cell sampling.
use super::{
    contract::{Family, StyleSettings},
    pixel::TileJob,
    StyleFrame,
};
use crate::{
    character::{JobStatus, RenderError},
    source::SourceImage,
};
#[derive(Debug)]
pub struct MosaicJob {
    pub(crate) tiles: TileJob,
}

#[derive(Debug)]
pub(crate) struct SparseTile {
    x0: usize,
    x: usize,
    y: usize,
    x1: usize,
    y1: usize,
    stride: usize,
    count: usize,
    sum: [f64; 3],
}
impl SparseTile {
    pub fn new(bounds: [f64; 4], scale: f64) -> Self {
        let [x0, y0, x1, y1] = bounds.map(|v| (v / scale).floor() as usize);
        Self {
            x0,
            x: x0,
            y: y0,
            x1,
            y1,
            stride: ((x1 - x0) / 3).max(1),
            count: 0,
            sum: [0.; 3],
        }
    }
    /// One source tap per cooperative work unit. Tone is clamped before averaging.
    pub fn step(
        &mut self,
        source: &SourceImage,
        geometry: &super::geometry::FrameGeometry,
        settings: &StyleSettings,
    ) -> bool {
        if self.x < self.x1 && self.y < self.y1 {
            let p = geometry.pixel(source, settings.rotation, self.x, self.y);
            let k = 259. * (settings.contrast + 255.) / (255. * (259. - settings.contrast));
            for (sum, channel) in self.sum.iter_mut().zip(&p[..3]) {
                let value = if p[3] == 0 { 0. } else { *channel as f64 };
                *sum +=
                    (k * (value - 128.) + 128. + 255. * settings.brightness / 100.).clamp(0., 255.);
            }
            self.count += 1;
            self.x += self.stride;
            if self.x >= self.x1 {
                self.x = self.x0;
                self.y += self.stride;
            }
        }
        self.x >= self.x1 || self.y >= self.y1
    }
    pub fn rgb(&self) -> [f64; 3] {
        if self.count == 0 {
            [0.; 3]
        } else {
            self.sum.map(|v| v / self.count as f64)
        }
    }
}

/// Integrate the circle's horizontal span across the destination pixel. Straight
/// edges retain exact fractional coverage; only curved edge pixels need quadrature.
pub(crate) fn rounded_coverage(bounds: [f64; 4], radius: f64, x: usize, y: usize) -> f64 {
    let [left, top, right, bottom] = bounds;
    let radius = radius.min((right - left) / 2.).min((bottom - top) / 2.);
    let (x, y) = (x as f64, y as f64);
    let width = (right.min(x + 1.) - left.max(x)).max(0.);
    let height = (bottom.min(y + 1.) - top.max(y)).max(0.);
    if radius <= 0.
        || (x >= left + radius && x + 1. <= right - radius)
        || (y >= top + radius && y + 1. <= bottom - radius)
    {
        return width * height;
    }
    let y0 = top.max(y);
    let mut area = 0.;
    for i in 0..32 {
        let py = y0 + height * (i as f64 + 0.5) / 32.;
        let dy = (top + radius - py).max(py - (bottom - radius)).max(0.);
        let inset = radius - (radius * radius - dy * dy).max(0.).sqrt();
        area += ((right - inset).min(x + 1.) - (left + inset).max(x)).max(0.);
    }
    area * height / 32.
}
impl MosaicJob {
    pub fn new(source: &SourceImage, s: StyleSettings, other: usize) -> Result<Self, RenderError> {
        if !matches!(s.family, Family::Mosaic { .. }) {
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
        if !matches!(s.family, Family::Mosaic { .. }) {
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
