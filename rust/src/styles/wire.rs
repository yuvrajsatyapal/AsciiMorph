//! Checked little-endian STY1 transport. No native casts or renderer registration.
use super::contract::{Family, StyleSettings};
use crate::character::{Crop, RenderError};
const HEADER: usize = 112;
const MAGIC: u32 = 0x31595453;
pub fn decode_style_settings(bytes: &[u8]) -> Result<StyleSettings, RenderError> {
    if bytes.len() < HEADER {
        return Err(RenderError::InvalidInput);
    }
    let u = |o: usize| u32::from_le_bytes(bytes[o..o + 4].try_into().unwrap());
    let f = |o: usize| f64::from_le_bytes(bytes[o..o + 8].try_into().unwrap());
    if u(0) != MAGIC || u(4) != 1 || u(12) != 1 || u(84) != 0 || u(108) != 0 {
        return Err(RenderError::InvalidInput);
    }
    let payload = match u(8) {
        4 => 40,
        10 => 32,
        11 => 36,
        _ => return Err(RenderError::InvalidInput),
    };
    if u(80) as usize != payload || bytes.len() != HEADER + payload {
        return Err(RenderError::InvalidInput);
    }
    if u(132) > 1 {
        return Err(RenderError::InvalidInput);
    }
    let family = match u(8) {
        4 => Family::Braille { threshold: f(144) },
        11 => Family::Mosaic { shape: u(144) },
        _ => Family::Pixel,
    };
    let s = StyleSettings {
        family,
        width: u(16),
        height: u(20),
        scale: u(24),
        rotation: u(28),
        seed: u(32),
        atlas_count: u(36),
        time_us: f(40),
        crop: Crop {
            x: f(48),
            y: f(56),
            width: f(64),
            height: f(72),
        },
        atlas_origin_x: f(88),
        atlas_origin_y: f(96),
        space_index: u(104),
        font_size: u(112),
        brightness: f(116),
        contrast: f(124),
        invert: u(132) == 1,
        opacity: f(136),
    };
    s.validate()?;
    Ok(s)
}
pub fn encode_style_settings(s: &StyleSettings) -> Result<Vec<u8>, RenderError> {
    s.validate()?;
    let mut b = vec![0; HEADER + s.payload_bytes()];
    for (o, v) in [
        (0, MAGIC),
        (4, 1),
        (8, s.dispatch_id()),
        (12, 1),
        (16, s.width),
        (20, s.height),
        (24, s.scale),
        (28, s.rotation),
        (32, s.seed),
        (36, s.atlas_count),
        (80, s.payload_bytes() as u32),
        (104, s.space_index),
        (112, s.font_size),
        (132, s.invert as u32),
    ] {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }
    for (o, v) in [
        (40, s.time_us),
        (48, s.crop.x),
        (56, s.crop.y),
        (64, s.crop.width),
        (72, s.crop.height),
        (88, s.atlas_origin_x),
        (96, s.atlas_origin_y),
        (116, s.brightness),
        (124, s.contrast),
        (136, s.opacity),
    ] {
        b[o..o + 8].copy_from_slice(&v.to_le_bytes());
    }
    match s.family {
        Family::Braille { threshold } => b[144..152].copy_from_slice(&threshold.to_le_bytes()),
        Family::Mosaic { shape } => b[144..148].copy_from_slice(&shape.to_le_bytes()),
        _ => (),
    };
    Ok(b)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture_cases() -> Vec<(Vec<u8>, Vec<f64>)> {
        let text = include_str!("../../../tests/fixtures/render/styles/wire-v1.json");
        let mut expected = Vec::new();
        let mut cases = Vec::new();
        for line in text.lines() {
            if let Some(values) = line.trim().strip_prefix("\"expected\": [") {
                expected = values
                    .split(']')
                    .next()
                    .unwrap()
                    .split(',')
                    .map(|v| v.trim().parse().unwrap())
                    .collect();
            }
            if let Some(hex) = line.trim().strip_prefix("\"hex\": \"") {
                let hex = hex.split('"').next().unwrap();
                cases.push((
                    (0..hex.len())
                        .step_by(2)
                        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                        .collect(),
                    expected.clone(),
                ));
            }
        }
        cases
    }
    #[test]
    fn shared_packets_and_malformed_mutations() {
        let cases = fixture_cases();
        assert_eq!(cases.len(), 3);
        for (bytes, expected) in &cases {
            let s = decode_style_settings(bytes).unwrap();
            assert_eq!(s.fixture_values(), *expected);
            assert_eq!(encode_style_settings(&s).unwrap(), *bytes);
            s.validate_source(17, 13).unwrap();
            assert!(s.validate_source(18, 13).is_err());
            assert!(decode_style_settings(&bytes[..bytes.len() - 1]).is_err());
            let mut trailing = bytes.clone();
            trailing.push(0);
            assert!(decode_style_settings(&trailing).is_err());
        }
        let text = include_str!("../../../tests/fixtures/render/styles/wire-v1.json");
        let mut count = 0;
        for line in text.lines().filter(|l| l.contains("\"patch\"")) {
            let p: Vec<usize> = line
                .split("\"patch\": [")
                .nth(1)
                .unwrap()
                .split(']')
                .next()
                .unwrap()
                .split(',')
                .map(|v| v.trim().parse().unwrap())
                .collect();
            let mut b = cases[p[0]].0.clone();
            for (i, v) in p[2..].iter().enumerate() {
                b[p[1] + i] = *v as u8;
            }
            assert!(decode_style_settings(&b).is_err(), "{line}");
            count += 1;
        }
        assert_eq!(count, 27);
    }
    #[test]
    fn source_geometry_and_encode_validation() {
        let cases = fixture_cases();
        let mut s = decode_style_settings(&cases[0].0).unwrap();
        s.crop.width = 0.5;
        s.rotation = 90;
        s.width = 13;
        s.height = 9;
        s.validate_source(17, 13).unwrap();
        assert!(s.validate_source(16385, 13).is_err());
        assert!(s.validate_source(16384, 16384).is_err());
        s.time_us = 0.5;
        assert!(encode_style_settings(&s).is_err());
        s.time_us = 0.0;
        s.width = u32::MAX;
        assert!(encode_style_settings(&s).is_err());
    }
}
