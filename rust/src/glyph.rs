//! Browser-calibrated numeric dictionary. Strings remain browser-owned.
use crate::character::{RenderError, MAX_SOURCE_BYTES, MAX_SOURCE_DIMENSION};
/// Required smart-edge dictionary entries, in `|`, `/`, `-`, `\\` order.
/// Wire adapters must transport these explicit indices; glyph order cannot imply orientation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DirectionalIndices {
    pub vertical: u16,
    pub slash: u16,
    pub horizontal: u16,
    pub backslash: u16,
}
#[derive(Debug, Clone)]
pub struct GlyphCalibration {
    pub(crate) glyph_count: u16,
    masks: Vec<u8>,
    pub(crate) coverage: Vec<f32>,
    pub(crate) shapes: Vec<f32>,
    pub(crate) directions: Option<DirectionalIndices>,
}
impl GlyphCalibration {
    pub fn new(
        glyph_count: u16,
        mask_width: u16,
        mask_height: u16,
        masks: Vec<u8>,
        coverage: Vec<f32>,
        shapes: Vec<f32>,
    ) -> Result<Self, RenderError> {
        let count = glyph_count as usize;
        let length = (mask_width as usize)
            .checked_mul(mask_height as usize)
            .and_then(|v| v.checked_mul(count))
            .ok_or(RenderError::BudgetExceeded)?;
        if !(2..=256).contains(&count)
            || mask_width == 0
            || mask_height == 0
            || mask_width as u32 > MAX_SOURCE_DIMENSION
            || mask_height as u32 > MAX_SOURCE_DIMENSION
            || length > MAX_SOURCE_BYTES
            || masks.len() != length
            || coverage.len() != count
            || shapes.len() != count * 9
            || coverage
                .iter()
                .chain(shapes.iter())
                .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        {
            return Err(RenderError::InvalidInput);
        }
        let result = Self {
            glyph_count,
            masks,
            coverage,
            shapes,
            directions: None,
        };
        if result.storage_bytes() > MAX_SOURCE_BYTES {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(result)
    }
    pub fn with_directional_indices(
        mut self,
        indices: DirectionalIndices,
    ) -> Result<Self, RenderError> {
        let values = [
            indices.vertical,
            indices.slash,
            indices.horizontal,
            indices.backslash,
        ];
        if values.iter().any(|&v| v >= self.glyph_count)
            || values
                .iter()
                .enumerate()
                .any(|(i, v)| values[..i].contains(v))
        {
            return Err(RenderError::InvalidInput);
        }
        self.directions = Some(indices);
        Ok(self)
    }
    pub fn storage_bytes(&self) -> usize {
        self.masks.capacity() + self.coverage.capacity() * 4 + self.shapes.capacity() * 4
    }
    pub fn glyph_count(&self) -> u16 {
        self.glyph_count
    }
    pub(crate) fn identity(&self) -> (usize, usize, usize, Option<DirectionalIndices>) {
        (
            self.masks.as_ptr() as usize,
            self.coverage.as_ptr() as usize,
            self.shapes.as_ptr() as usize,
            self.directions,
        )
    }
}
