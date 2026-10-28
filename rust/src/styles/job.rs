//! Native job boundary. A transport schema never registers a numerical renderer.
use super::{
    braille::BrailleJob,
    contract::{Family, StyleSettings},
    mosaic::MosaicJob,
    pixel::PixelJob,
};
use crate::{
    character::{JobStatus, RenderError},
    reference_characters::ReferenceAtlas,
    source::SourceImage,
};
#[derive(Debug)]
pub struct StyleFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}
/// Numerical release jobs are registered separately from wire schema support.
pub enum StyleJob {
    Unavailable,
    Pixel(PixelJob),
    Mosaic(MosaicJob),
    Braille(BrailleJob),
    #[cfg(test)]
    Fixture(fixture::FixtureJob),
}
pub fn supports_style(dispatch_id: u32) -> bool {
    matches!(dispatch_id, 4 | 10 | 11)
}
impl StyleJob {
    pub fn new(
        source: &SourceImage,
        settings: StyleSettings,
        atlas: Option<&ReferenceAtlas>,
        other_bytes: usize,
    ) -> Result<Self, RenderError> {
        match settings.family {
            Family::Pixel if atlas.is_none() => {
                PixelJob::new(source, settings, other_bytes).map(Self::Pixel)
            }
            Family::Mosaic { .. } => {
                if atlas.is_some() {
                    return Err(RenderError::InvalidInput);
                }
                MosaicJob::new(source, settings, other_bytes).map(Self::Mosaic)
            }
            Family::Pixel => Err(RenderError::InvalidInput),
            Family::Braille { .. } => BrailleJob::new(
                source,
                settings,
                atlas.ok_or(RenderError::MissingCalibration)?,
                other_bytes,
            )
            .map(Self::Braille),
        }
    }
    /// Total session peak: retained source + other session reservations (including
    /// captured calibrations) + this job's dynamic storage and output serialization.
    /// Borrowed atlas allocations are already included in `other_bytes` exactly once.
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        settings: &StyleSettings,
        atlas: Option<&ReferenceAtlas>,
        other_bytes: usize,
    ) -> Result<usize, RenderError> {
        match settings.family {
            Family::Pixel | Family::Mosaic { .. } => {
                if atlas.is_some() {
                    return Err(RenderError::InvalidInput);
                }
                super::pixel::TileJob::peak(source, settings, other_bytes)
            }
            Family::Braille { .. } => BrailleJob::estimated_peak_bytes(
                source,
                settings,
                atlas.ok_or(RenderError::MissingCalibration)?,
                other_bytes,
            ),
        }
    }
    pub fn step(
        &mut self,
        _source: &SourceImage,
        _atlas: Option<&ReferenceAtlas>,
        _max_work: u32,
    ) -> Result<JobStatus, RenderError> {
        match self {
            Self::Unavailable => Err(RenderError::UnsupportedVersion),
            Self::Pixel(j) => j.tiles.step(_source, _max_work),
            Self::Mosaic(j) => j.tiles.step(_source, _max_work),
            Self::Braille(j) => j.step(
                _source,
                _atlas.ok_or(RenderError::MissingCalibration)?,
                _max_work,
            ),
            #[cfg(test)]
            Self::Fixture(j) => j.step(_source, _atlas, _max_work),
        }
    }
    pub(crate) fn configure_context(&mut self, c: crate::style_context::StyleContext) {
        match self {
            Self::Pixel(j) => j.tiles.configure_context(c),
            Self::Mosaic(j) => j.tiles.configure_context(c),
            Self::Braille(j) => j.configure_context(c),
            _ => (),
        }
    }
    pub fn storage_bytes(&self) -> usize {
        match self {
            Self::Unavailable => 0,
            Self::Pixel(j) => j.tiles.storage_bytes(),
            Self::Mosaic(j) => j.tiles.storage_bytes(),
            Self::Braille(j) => j.storage_bytes(),
            #[cfg(test)]
            Self::Fixture(j) => j.storage_bytes(),
        }
    }
    pub(crate) fn capacity_excess_bytes(&self) -> usize {
        match self {
            Self::Unavailable => 0,
            Self::Pixel(j) => j.tiles.capacity_excess_bytes(),
            Self::Mosaic(j) => j.tiles.capacity_excess_bytes(),
            Self::Braille(j) => j.capacity_excess_bytes(),
            #[cfg(test)]
            Self::Fixture(j) => j.capacity_excess_bytes(),
        }
    }
    pub fn cancel(&mut self) {
        match self {
            Self::Pixel(j) => j.tiles.cancel(),
            Self::Mosaic(j) => j.tiles.cancel(),
            Self::Braille(j) => j.cancel(),
            _ => (),
        }
        #[cfg(test)]
        if let Self::Fixture(j) = self {
            j.cancel();
        }
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        match self {
            Self::Unavailable => None,
            Self::Pixel(j) => j.tiles.take_frame(),
            Self::Mosaic(j) => j.tiles.take_frame(),
            Self::Braille(j) => j.take_frame(),
            #[cfg(test)]
            Self::Fixture(j) => j.take_frame(),
        }
    }
}
#[cfg(test)]
#[path = "fixture_job.rs"]
mod fixture;
#[cfg(test)]
impl StyleJob {
    pub(crate) fn fixture_peak(
        source: &SourceImage,
        settings: &StyleSettings,
        atlas: Option<&ReferenceAtlas>,
        other: usize,
    ) -> Result<usize, RenderError> {
        fixture::FixtureJob::peak(source, settings, atlas, other)
    }
    pub(crate) fn fixture_new(
        source: &SourceImage,
        settings: StyleSettings,
        atlas: Option<&ReferenceAtlas>,
        other: usize,
    ) -> Result<Self, RenderError> {
        fixture::FixtureJob::new(source, settings, atlas, other).map(Self::Fixture)
    }
}
