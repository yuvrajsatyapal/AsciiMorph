//! Additive captured context; historical ABI settings remain immutable.
use crate::character::RenderError;
#[derive(Debug, Clone, Copy)]
pub struct StyleContext {
    pub backdrop: u32, // none, black, original, blur
    pub blend: u32,
    pub softness: f64,
    pub background_opacity: f64,
    pub opacity: f64,
    pub coverage: f64,
    pub invert: bool,
    pub random: bool,
    pub seed: u32,
}
impl Default for StyleContext {
    fn default() -> Self {
        Self {
            backdrop: 3,
            blend: 0,
            softness: 8.,
            background_opacity: 100.,
            opacity: 100.,
            coverage: 100.,
            invert: false,
            random: false,
            seed: 0,
        }
    }
}
impl StyleContext {
    pub fn decode(b: &[u8]) -> Result<Self, RenderError> {
        if b.len() != 64 {
            return Err(RenderError::InvalidInput);
        }
        let u = |o| u32::from_le_bytes(b[o..o + 4].try_into().unwrap());
        let f = |o| f64::from_le_bytes(b[o..o + 8].try_into().unwrap());
        if u(0) != 0x31584353
            || u(4) != 1
            || u(8) > 3
            || u(12) > 4
            || u(48) > 1
            || u(52) > 1
            || u(60) != 0
        {
            return Err(RenderError::InvalidInput);
        }
        let s = Self {
            backdrop: u(8),
            blend: u(12),
            softness: f(16),
            background_opacity: f(24),
            opacity: f(32),
            coverage: f(40),
            invert: u(48) == 1,
            random: u(52) == 1,
            seed: u(56),
        };
        for (v, max) in [
            (s.softness, 60.),
            (s.background_opacity, 100.),
            (s.opacity, 100.),
            (s.coverage, 100.),
        ] {
            if !v.is_finite() || v < 0. || v > max {
                return Err(RenderError::InvalidInput);
            }
        }
        Ok(s)
    }
    pub fn hash(&self, x: usize, y: usize) -> u32 {
        let mut h =
            self.seed ^ (x as u32).wrapping_mul(0x9e3779b9) ^ (y as u32).wrapping_mul(0x85ebca6b);
        h ^= h >> 16;
        h = h.wrapping_mul(0x7feb352d);
        h ^= h >> 15;
        h = h.wrapping_mul(0x846ca68b);
        h ^ (h >> 16)
    }
    pub fn occupied(&self, x: usize, y: usize) -> bool {
        self.coverage >= 100.
            || (self.coverage > 0. && self.hash(x, y) as f64 / 4294967296. < self.coverage / 100.)
    }
    pub fn composite(&self, p: &mut [u8], mut bg: [f32; 4]) {
        let k = self.background_opacity as f32 / 100.;
        for v in &mut bg {
            *v *= k;
        }
        p[3] = (p[3] as f64 * self.opacity / 100.).round() as u8;
        blend_pixel(p, bg, self.blend);
    }
}
/// Straight byte source and premultiplied byte backdrop. W3C compositing/blending.
pub fn blend_pixel(p: &mut [u8], bg: [f32; 4], mode: u32) {
    if mode == 0 {
        crate::character_backdrop::source_over(p, bg);
        return;
    }
    let sa = p[3] as f64 / 255.;
    let ba = (bg[3] as f64).clamp(0., 1.);
    let a = if mode == 4 {
        (sa + ba).min(1.)
    } else {
        sa + ba - sa * ba
    };
    if (a * 255.).round() == 0. {
        p.fill(0);
        return;
    }
    for k in 0..3 {
        let s = p[k] as f64 / 255.;
        let bp = bg[k] as f64 / 255.;
        let b = if ba > 0. { bp / ba } else { 0. };
        let blend = match mode {
            1 => {
                if b <= 0.5 {
                    2. * s * b
                } else {
                    1. - 2. * (1. - s) * (1. - b)
                }
            }
            2 => {
                if b == 0. {
                    0.
                } else if s >= 1. {
                    1.
                } else {
                    (b / (1. - s)).min(1.)
                }
            }
            3 => b + s - b * s,
            _ => s,
        };
        let premul = if mode == 4 {
            (s * sa + bp).min(1.)
        } else {
            (1. - sa) * bp + (1. - ba) * sa * s + sa * ba * blend
        };
        p[k] = (premul / a * 255.).round().clamp(0., 255.) as u8;
    }
    p[3] = (a * 255.).round() as u8;
}
