//! Numeric compatibility stages retain f64 arithmetic until legacy Float32Array boundaries.
use crate::{
    character::{CharacterSettings, RenderError},
    source::{preflight, sample_source, transform_view, SourceImage},
};
pub fn luminance(r: f64, g: f64, b: f64) -> f64 {
    0.2126 * r + 0.7152 * g + 0.0722 * b
}
pub fn tone(value: f64, brightness: f64, contrast: f64, gamma: f64) -> f64 {
    let contrast = contrast / 100.0;
    let factor = if contrast == 1.0 {
        255.0
    } else {
        (1.0 + contrast) / (1.0 - contrast)
    };
    255.0
        * (((value - 127.5) * factor + 127.5 + brightness * 2.55).clamp(0.0, 255.0) / 255.0)
            .powf(1.0 / gamma)
}
#[derive(Debug)]
pub struct PreparedSamples {
    pub width: usize,
    pub height: usize,
    pub rgb: Vec<f32>,
    pub alpha: Vec<f32>,
    pub values: Vec<f32>,
    pub filtered: Vec<f32>,
    pub gradients: Vec<f64>,
}
pub fn prepare(
    source: &SourceImage,
    s: &CharacterSettings,
) -> Result<PreparedSamples, RenderError> {
    preflight(source, s)?;
    let image = transform_view(source, s)?;
    let (width, height) = s.sample_dimensions()?;
    let samples = sample_source(&image, width, height)?;
    let n = width * height;
    let mut rgb = vec![0.0; n * 3];
    let mut alpha = vec![0.0; n];
    let mut values = vec![0.0; n];
    for i in 0..n {
        let p = &samples[i * 4..i * 4 + 4];
        let gray = luminance(p[0], p[1], p[2]);
        let r = tone(
            gray + (p[0] - gray) * s.saturation / 100.0,
            s.brightness,
            s.contrast,
            s.gamma,
        );
        let g = tone(
            gray + (p[1] - gray) * s.saturation / 100.0,
            s.brightness,
            s.contrast,
            s.gamma,
        );
        let b = tone(
            gray + (p[2] - gray) * s.saturation / 100.0,
            s.brightness,
            s.contrast,
            s.gamma,
        );
        rgb[i * 3..i * 3 + 3].copy_from_slice(&[r as f32, g as f32, b as f32]);
        alpha[i] = p[3] as f32;
        let l = luminance(r, g, b);
        values[i] = if s.mapping_invert {
            (255.0 - l) as f32
        } else {
            l as f32
        };
    }
    drop(samples);
    let mut gradients = vec![0.0; n * 3];
    crate::gradients(&values, width, height, &mut gradients);
    let mut filtered = vec![0.0; n];
    for i in 0..n {
        let v = values[i] as f64;
        let blur = gradients[i * 3];
        let gx = gradients[i * 3 + 1];
        let gy = gradients[i * 3 + 2];
        let sharp = (v + (v - blur) * s.sharpness / 25.0).clamp(0.0, 255.0);
        filtered[i] = (255.0
            * ((sharp * (1.0 - s.edge / 100.0) + gx.hypot(gy).clamp(0.0, 255.0) * s.edge / 100.0)
                .clamp(0.0, 255.0)
                / 255.0)
                .powf(s.density)) as f32;
    }
    Ok(PreparedSamples {
        width,
        height,
        rgb,
        alpha,
        values,
        filtered,
        gradients,
    })
}
