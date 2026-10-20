//! Retained straight-alpha sRGB source and crop-before-clockwise-rotation geometry.
use crate::character::{
    checked_cells, CharacterSettings, RenderError, MAX_CHARACTER_CELLS, MAX_SOURCE_BYTES,
    MAX_SOURCE_DIMENSION,
};
use std::borrow::Cow;
#[derive(Debug, Clone)]
pub struct SourceImage {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
    budget: usize,
}
impl SourceImage {
    pub fn new(width: u32, height: u32, rgba: Vec<u8>, budget: usize) -> Result<Self, RenderError> {
        if width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION {
            return Err(RenderError::InvalidInput);
        }
        let length = checked_cells(width as usize, height as usize, MAX_SOURCE_BYTES / 4)?
            .checked_mul(4)
            .ok_or(RenderError::BudgetExceeded)?;
        if rgba.len() != length {
            return Err(RenderError::InvalidInput);
        }
        if rgba.capacity() > budget {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(Self {
            width,
            height,
            rgba,
            budget,
        })
    }
    pub fn width(&self) -> u32 {
        self.width
    }
    pub fn height(&self) -> u32 {
        self.height
    }
    pub fn rgba(&self) -> &[u8] {
        &self.rgba
    }
    pub fn budget(&self) -> usize {
        self.budget
    }
    pub fn storage_bytes(&self) -> usize {
        self.rgba.capacity()
    }
}
#[derive(Debug, Clone, Copy)]
pub struct Geometry {
    pub x: usize,
    pub y: usize,
    pub crop_width: usize,
    pub crop_height: usize,
    pub width: usize,
    pub height: usize,
    pub identity: bool,
}
pub fn geometry(source: &SourceImage, s: &CharacterSettings) -> Result<Geometry, RenderError> {
    s.validate()?;
    let (iw, ih) = (source.width as usize, source.height as usize);
    let x = ((s.crop.x * iw as f64).floor() as usize).min(iw - 1);
    let y = ((s.crop.y * ih as f64).floor() as usize).min(ih - 1);
    let w = ((s.crop.width * iw as f64).round() as usize)
        .max(1)
        .min(iw - x);
    let h = ((s.crop.height * ih as f64).round() as usize)
        .max(1)
        .min(ih - y);
    let (width, height) = if s.rotation == 90 || s.rotation == 270 {
        (h, w)
    } else {
        (w, h)
    };
    Ok(Geometry {
        x,
        y,
        crop_width: w,
        crop_height: h,
        width,
        height,
        identity: x == 0 && y == 0 && w == iw && h == ih && s.rotation == 0,
    })
}
/// Conservative simultaneous source, transform, numeric, diffusion and packed-output storage.
/// Caller adds retained calibration/session staging bytes separately in the session preflight.
pub fn estimated_peak_bytes(
    source: &SourceImage,
    s: &CharacterSettings,
) -> Result<usize, RenderError> {
    let g = geometry(source, s)?;
    let (sw, sh) = s.sample_dimensions()?;
    let samples = sw.checked_mul(sh).ok_or(RenderError::BudgetExceeded)?;
    let transform = if g.identity {
        0
    } else {
        g.width
            .checked_mul(g.height)
            .and_then(|n| n.checked_mul(4))
            .ok_or(RenderError::BudgetExceeded)?
    };
    source
        .storage_bytes()
        .checked_add(transform)
        .and_then(|n| samples.checked_mul(112).and_then(|v| n.checked_add(v)))
        .and_then(|n| {
            (s.width as usize)
                .checked_mul(s.height as usize)
                .and_then(|v| v.checked_mul(14))
                .and_then(|v| n.checked_add(v))
        })
        .ok_or(RenderError::BudgetExceeded)
}
pub fn preflight(source: &SourceImage, s: &CharacterSettings) -> Result<usize, RenderError> {
    let peak = estimated_peak_bytes(source, s)?;
    if peak > source.budget {
        Err(RenderError::BudgetExceeded)
    } else {
        Ok(peak)
    }
}
pub fn transform_view<'a>(
    source: &'a SourceImage,
    s: &CharacterSettings,
) -> Result<Cow<'a, SourceImage>, RenderError> {
    preflight(source, s)?;
    let g = geometry(source, s)?;
    if g.identity {
        return Ok(Cow::Borrowed(source));
    }
    let mut rgba = vec![0; g.width * g.height * 4];
    for y in 0..g.crop_height {
        for x in 0..g.crop_width {
            let (xx, yy) = match s.rotation {
                90 => (g.crop_height - 1 - y, x),
                180 => (g.crop_width - 1 - x, g.crop_height - 1 - y),
                270 => (y, g.crop_width - 1 - x),
                _ => (x, y),
            };
            let from = ((y + g.y) * source.width as usize + x + g.x) * 4;
            let to = (yy * g.width + xx) * 4;
            rgba[to..to + 4].copy_from_slice(&source.rgba[from..from + 4]);
        }
    }
    Ok(Cow::Owned(SourceImage::new(
        g.width as u32,
        g.height as u32,
        rgba,
        source.budget,
    )?))
}
/// Owned compatibility convenience. Rendering should use `transform_view` to borrow identities.
pub fn transform(source: &SourceImage, s: &CharacterSettings) -> Result<SourceImage, RenderError> {
    let view = transform_view(source, s)?;
    if matches!(view, Cow::Borrowed(_))
        && source
            .storage_bytes()
            .checked_add(source.rgba.len())
            .ok_or(RenderError::BudgetExceeded)?
            > source.budget
    {
        return Err(RenderError::BudgetExceeded);
    }
    Ok(view.into_owned())
}
/// Validated alpha-weighted area samples: RGB in 0..255, straight alpha in 0..1.
pub fn sample_source(
    source: &SourceImage,
    width: usize,
    height: usize,
) -> Result<Vec<f64>, RenderError> {
    let cells = checked_cells(width, height, MAX_CHARACTER_CELLS * 8)?;
    let bytes = cells
        .checked_mul(32)
        .and_then(|n| n.checked_add(source.storage_bytes()))
        .ok_or(RenderError::BudgetExceeded)?;
    if bytes > source.budget {
        return Err(RenderError::BudgetExceeded);
    }
    let mut samples = vec![0.0; cells * 4];
    crate::sample(
        &source.rgba,
        source.width as usize,
        source.height as usize,
        width,
        height,
        &mut samples,
    );
    Ok(samples)
}
