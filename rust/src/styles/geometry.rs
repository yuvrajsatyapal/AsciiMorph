//! Exact crop-before-quarter-turn geometry shared by independent style families.
use super::contract::StyleSettings;
use crate::{
    character::RenderError,
    reference_characters::{crop_geometry, Geometry},
    source::SourceImage,
};

#[derive(Debug, Clone, Copy)]
pub struct FrameGeometry {
    pub(crate) inner: Geometry,
    frame_width: usize,
    frame_height: usize,
}
impl FrameGeometry {
    pub fn new(source: &SourceImage, settings: &StyleSettings) -> Result<Self, RenderError> {
        settings.validate_source(source.width(), source.height())?;
        let inner = crop_geometry(
            source,
            settings.crop,
            settings.rotation as u16,
            settings.width,
            settings.height,
            settings.scale as u8,
        )?;
        Ok(Self {
            inner,
            frame_width: settings.width as usize,
            frame_height: settings.height as usize,
        })
    }
    pub fn extent(&self) -> (usize, usize) {
        self.inner.extent()
    }
    pub fn frame_extent(&self) -> (usize, usize) {
        (self.frame_width, self.frame_height)
    }
    pub fn pixel(&self, source: &SourceImage, rotation: u32, x: usize, y: usize) -> [u8; 4] {
        self.inner.pixel(source, rotation as u16, x, y)
    }
}
