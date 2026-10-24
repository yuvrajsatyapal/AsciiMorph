//! Native job boundary. A transport schema never registers a numerical renderer.
use super::contract::StyleSettings;
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
/// No release family is registered yet. Unavailable cannot produce a successful frame.
pub enum StyleJob {
    Unavailable,
    #[cfg(test)]
    Fixture(fixture::FixtureJob),
}
pub fn supports_style(_dispatch_id: u32) -> bool {
    false
}
impl StyleJob {
    pub fn new(
        _source: &SourceImage,
        _settings: StyleSettings,
        _atlas: Option<&ReferenceAtlas>,
        _other_bytes: usize,
    ) -> Result<Self, RenderError> {
        Err(RenderError::UnsupportedVersion)
    }
    /// Total session peak: retained source + other session reservations (including
    /// captured calibrations) + this job's dynamic storage and output serialization.
    /// Borrowed atlas allocations are already included in `other_bytes` exactly once.
    pub fn estimated_peak_bytes(
        _source: &SourceImage,
        _settings: &StyleSettings,
        _atlas: Option<&ReferenceAtlas>,
        _other_bytes: usize,
    ) -> Result<usize, RenderError> {
        Err(RenderError::UnsupportedVersion)
    }
    pub fn step(
        &mut self,
        _source: &SourceImage,
        _atlas: Option<&ReferenceAtlas>,
        _max_work: u32,
    ) -> Result<JobStatus, RenderError> {
        match self {
            Self::Unavailable => Err(RenderError::UnsupportedVersion),
            #[cfg(test)]
            Self::Fixture(j) => j.step(_source, _atlas, _max_work),
        }
    }
    pub fn storage_bytes(&self) -> usize {
        match self {
            Self::Unavailable => 0,
            #[cfg(test)]
            Self::Fixture(j) => j.storage_bytes(),
        }
    }
    pub(crate) fn capacity_excess_bytes(&self) -> usize {
        match self {
            Self::Unavailable => 0,
            #[cfg(test)]
            Self::Fixture(j) => j.capacity_excess_bytes(),
        }
    }
    pub fn cancel(&mut self) {
        #[cfg(test)]
        if let Self::Fixture(j) = self {
            j.cancel();
        }
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        match self {
            Self::Unavailable => None,
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
