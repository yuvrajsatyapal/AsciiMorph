//! Compiled only for unit tests; never registered or advertised by the release ABI.
use super::*;
type AtlasIdentity = (usize, u16, u16, u16, u64, u64, u16);
pub struct FixtureJob {
    width: u32,
    height: u32,
    source_identity: usize,
    atlas_identity: Option<AtlasIdentity>,
    rgba: Vec<u8>,
    scratch: Vec<u8>,
    cursor: usize,
    cancelled: bool,
}
impl FixtureJob {
    pub fn peak(
        source: &SourceImage,
        s: &StyleSettings,
        _atlas: Option<&ReferenceAtlas>,
        other: usize,
    ) -> Result<usize, RenderError> {
        s.validate_source(source.width(), source.height())?;
        source
            .storage_bytes()
            .checked_add(other)
            .and_then(|n| n.checked_add(std::mem::size_of::<StyleJob>()))
            .and_then(|n| n.checked_add(s.width as usize * s.height as usize * 8 + 17 + 16))
            .ok_or(RenderError::BudgetExceeded)
    }
    pub fn new(
        source: &SourceImage,
        s: StyleSettings,
        atlas: Option<&ReferenceAtlas>,
        other: usize,
    ) -> Result<Self, RenderError> {
        Self::peak(source, &s, atlas, other)?;
        Ok(Self {
            width: s.width,
            height: s.height,
            source_identity: source.rgba().as_ptr() as usize,
            atlas_identity: atlas.map(ReferenceAtlas::identity),
            rgba: vec![0; s.width as usize * s.height as usize * 4],
            scratch: Vec::new(),
            cursor: 0,
            cancelled: false,
        })
    }
    pub fn capacity_excess_bytes(&self) -> usize {
        self.rgba.capacity().saturating_sub(self.rgba.len())
            + self.scratch.capacity().saturating_sub(self.scratch.len())
    }
    pub fn storage_bytes(&self) -> usize {
        self.rgba.capacity() + self.scratch.capacity()
    }
    pub fn step(
        &mut self,
        source: &SourceImage,
        atlas: Option<&ReferenceAtlas>,
        work: u32,
    ) -> Result<JobStatus, RenderError> {
        if self.cancelled {
            return Ok(JobStatus::Cancelled);
        }
        if source.rgba().as_ptr() as usize != self.source_identity
            || atlas.map(ReferenceAtlas::identity) != self.atlas_identity
        {
            return Err(RenderError::InvalidInput);
        }
        if work == 0 {
            return Ok(JobStatus::Pending);
        }
        if self.scratch.is_empty() {
            self.scratch = vec![0; 17];
        }
        let end = self
            .cursor
            .saturating_add(work as usize)
            .min(self.rgba.len());
        for i in self.cursor..end {
            self.rgba[i] = source.rgba()[i];
        }
        self.cursor = end;
        Ok(if self.cursor == self.rgba.len() {
            JobStatus::Complete
        } else {
            JobStatus::Pending
        })
    }
    pub fn cancel(&mut self) {
        self.cancelled = true;
        self.rgba = Vec::new();
        self.scratch = Vec::new();
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        if self.cancelled || self.cursor != self.rgba.len() {
            return None;
        }
        Some(StyleFrame {
            width: self.width,
            height: self.height,
            rgba: std::mem::take(&mut self.rgba),
        })
    }
}
