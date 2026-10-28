//! Closed independent profiles only. This does not register native renderers.
use crate::character::{Crop, RenderError};
#[derive(Debug, Clone, PartialEq)]
pub enum Family {
    Pixel,
    Dither(DitherSettings),
    Mosaic { shape: u32 },
    Braille { threshold: f64 },
}
#[derive(Debug, Clone, PartialEq)]
pub struct DitherSettings {
    pub algorithm: u32,
    pub palette: u32,
    pub chroma: u32,
    pub pixel_size: u32,
    pub strength: f64,
    pub contrast: f64,
    pub threshold: f64,
    pub angle: f64,
    pub custom: Vec<[u8; 3]>,
    pub animate: bool,
    pub shimmer: bool,
    pub direction: u32,
    pub speed: u32,
}
impl DitherSettings {
    pub fn validate(&self) -> bool {
        self.algorithm < 15
            && self.palette < 16
            && self.chroma < 3
            && (1..=12).contains(&self.pixel_size)
            && [
                (self.strength, 100.),
                (self.contrast, 200.),
                (self.threshold, 100.),
                (self.angle, 180.),
            ]
            .iter()
            .all(|(v, max)| bounded(*v, 0., *max) && v.fract() == 0.)
            && !self.animate
            && !self.shimmer
            && self.direction < 8
            && (1..=4).contains(&self.speed)
            && (2..=64).contains(&self.custom.len())
    }
}
#[derive(Debug, Clone, PartialEq)]
pub struct StyleSettings {
    pub family: Family,
    pub width: u32,
    pub height: u32,
    pub scale: u32,
    pub rotation: u32,
    pub seed: u32,
    pub time_us: f64,
    pub crop: Crop,
    pub atlas_count: u32,
    pub atlas_origin_x: f64,
    pub atlas_origin_y: f64,
    pub space_index: u32,
    pub font_size: u32,
    pub brightness: f64,
    pub contrast: f64,
    pub invert: bool,
    pub opacity: f64,
}
fn bounded(v: f64, min: f64, max: f64) -> bool {
    v.is_finite() && v >= min && v <= max
}
impl StyleSettings {
    pub fn dispatch_id(&self) -> u32 {
        match self.family {
            Family::Pixel => 10,
            Family::Dither(_) => 15,
            Family::Mosaic { .. } => 11,
            Family::Braille { .. } => 4,
        }
    }
    pub fn payload_bytes(&self) -> usize {
        match self.family {
            Family::Pixel => 32,
            Family::Dither(ref d) => 72 + d.custom.len() * 3,
            Family::Mosaic { .. } => 36,
            Family::Braille { .. } => 40,
        }
    }
    pub fn validate(&self) -> Result<(), RenderError> {
        let c = self.crop;
        let pixels = (self.width as u64)
            .checked_mul(self.height as u64)
            .ok_or(RenderError::InvalidInput)?;
        let mut valid = self.width > 0
            && self.height > 0
            && self.width <= 16384
            && self.height <= 16384
            && pixels <= 32_000_000
            && (1..=4).contains(&self.scale)
            && [0, 90, 180, 270].contains(&self.rotation)
            && bounded(self.time_us, 0.0, 9_007_199_254_740_991.0)
            && self.time_us.fract() == 0.0
            && bounded(c.x, 0.0, 1.0)
            && bounded(c.y, 0.0, 1.0)
            && bounded(c.width, 0.0, 1.0)
            && c.width > 0.0
            && bounded(c.height, 0.0, 1.0)
            && c.height > 0.0
            && c.x + c.width <= 1.0
            && c.y + c.height <= 1.0
            && (3..=80).contains(&self.font_size)
            && bounded(self.brightness, -100.0, 100.0)
            && bounded(self.contrast, -100.0, 100.0)
            && bounded(self.opacity, 0.0, 100.0)
            && self.space_index == 65535;
        valid &= match self.family {
            Family::Dither(ref d) => {
                d.validate()
                    && self.atlas_count == 0
                    && self.atlas_origin_x == 0.
                    && self.atlas_origin_y == 0.
                    && self.font_size == 3
                    && self.brightness == 0.
                    && self.contrast == 0.
                    && !self.invert
                    && self.opacity == 100.
            }
            Family::Pixel => {
                self.atlas_count == 0 && self.atlas_origin_x == 0.0 && self.atlas_origin_y == 0.0
            }
            Family::Mosaic { shape } => {
                shape <= 2
                    && self.atlas_count == 0
                    && self.atlas_origin_x == 0.0
                    && self.atlas_origin_y == 0.0
            }
            Family::Braille { threshold } => {
                bounded(threshold, 0.0, 100.0)
                    && self.atlas_count == 256
                    && bounded(self.atlas_origin_x, -16384.0, 16384.0)
                    && bounded(self.atlas_origin_y, -16384.0, 16384.0)
            }
        };
        if valid {
            Ok(())
        } else {
            Err(RenderError::InvalidInput)
        }
    }
    /// Resource dictionary/masks are validated when an actual captured atlas is available.
    pub fn validate_source(&self, width: u32, height: u32) -> Result<(), RenderError> {
        self.validate()?;
        if width == 0
            || height == 0
            || width > 16384
            || height > 16384
            || width as u64 * height as u64 * 4 > 268_435_456
        {
            return Err(RenderError::InvalidInput);
        }
        let c = self.crop;
        let cw = ((c.x + c.width) * width as f64).ceil().min(width as f64)
            - (c.x * width as f64).floor();
        let ch = ((c.y + c.height) * height as f64).ceil().min(height as f64)
            - (c.y * height as f64).floor();
        let (w, h) = if self.rotation == 90 || self.rotation == 270 {
            (ch, cw)
        } else {
            (cw, ch)
        };
        if cw <= 0.0
            || ch <= 0.0
            || self.width as f64 != w * self.scale as f64
            || self.height as f64 != h * self.scale as f64
        {
            Err(RenderError::InvalidInput)
        } else {
            Ok(())
        }
    }
    #[cfg(test)]
    pub(crate) fn fixture_values(&self) -> Vec<f64> {
        let mut v = vec![
            self.dispatch_id() as f64,
            self.width as f64,
            self.height as f64,
            self.scale as f64,
            self.rotation as f64,
            self.seed as f64,
            self.atlas_count as f64,
            self.time_us,
            self.crop.x,
            self.crop.y,
            self.crop.width,
            self.crop.height,
            self.atlas_origin_x,
            self.atlas_origin_y,
            self.space_index as f64,
            self.font_size as f64,
            self.brightness,
            self.contrast,
            self.invert as u8 as f64,
            self.opacity,
        ];
        match self.family {
            Family::Mosaic { shape } => v.push(shape as f64),
            Family::Braille { threshold } => v.push(threshold),
            _ => (),
        };
        v
    }
}
