//! Square, wide and tall whole-rectangle tile rendering.
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
