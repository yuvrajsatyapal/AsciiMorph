use asciimorph_engine::{
    character::{Crop, JobStatus, RenderError, MAX_SOURCE_BYTES},
    reference_characters::ReferenceAtlas,
    source::SourceImage,
    styles::{
        braille::BrailleJob,
        contract::{Family, StyleSettings},
    },
};
const BITS: [u8; 8] = [1, 8, 2, 16, 4, 32, 64, 128];
fn settings(w: u32, h: u32) -> StyleSettings {
    StyleSettings {
        family: Family::Braille { threshold: 50. },
        width: w,
        height: h,
        scale: 1,
        rotation: 0,
        seed: 0,
        time_us: 0.,
        crop: Crop {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        },
        atlas_count: 256,
        atlas_origin_x: 0.,
        atlas_origin_y: 0.,
        space_index: 65535,
        font_size: 20,
        brightness: 0.,
        contrast: 0.,
        invert: false,
        opacity: 100.,
    }
}
fn atlas() -> ReferenceAtlas {
    let mut m = vec![0; 256 * 8];
    for g in 1..256 {
        for b in 0..8 {
            m[g * 8 + b] = if g & (1 << b) != 0 { 255 } else { 0 };
        }
    }
    ReferenceAtlas::new(256, 8, 1, m, 0., 0., 65535).unwrap()
}
fn src(pattern: u8, value: u8, alpha: u8) -> SourceImage {
    let mut p = vec![];
    for y in 0..20 {
        for x in 0..12 {
            let bit = BITS[(y / 5) * 2 + x / 6];
            let v = if pattern & bit != 0 { value } else { 0 };
            p.extend([v, v, v, alpha]);
        }
    }
    SourceImage::new(12, 20, p, MAX_SOURCE_BYTES).unwrap()
}
fn render(src: &SourceImage, s: StyleSettings, a: &ReferenceAtlas, work: u32) -> Vec<u8> {
    let mut j = BrailleJob::new(src, s, a, 0).unwrap();
    assert_eq!(j.step(src, a, 0).unwrap(), JobStatus::Pending);
    while j.step(src, a, work).unwrap() == JobStatus::Pending {}
    j.take_frame().unwrap().rgba
}
#[test]
fn all_256_spatial_patterns_and_single_dot_mapping() {
    let a = atlas();
    for pattern in 0..=255u8 {
        let src = src(pattern, 128, 255);
        let mut s = settings(12, 20);
        s.family = Family::Braille { threshold: 50. };
        s.brightness = 30.;
        let mut base = s.clone();
        base.opacity = 0.;
        let plain = render(&src, base, &a, 1000);
        let out = render(&src, s, &a, 7);
        for b in 0..8 {
            assert_eq!(
                out[b * 4] > plain[b * 4],
                pattern & (1 << b) != 0,
                "pattern {pattern},bit {b}"
            );
        }
    }
}
#[test]
fn threshold_and_transparency() {
    let a = atlas();
    for (v, alpha, on) in [(127, 255, false), (128, 255, true), (255, 0, false)] {
        let source = src(1, v, alpha);
        let mut s = settings(12, 20);
        s.brightness = 0.;
        let mut j = BrailleJob::new(&source, s.clone(), &a, 0).unwrap();
        while j.step(&source, &a, 1).unwrap() == JobStatus::Pending {}
        let f = j.take_frame().unwrap();
        let mut base = s.clone();
        base.opacity = 0.;
        let b = render(&source, base, &a, 4);
        assert_eq!(f.rgba != b, on);
    }
}
#[test]
fn equal_mean_cells_keep_spatial_identity() {
    let a = atlas();
    let mut s = settings(12, 20);
    s.brightness = 30.;
    assert_ne!(
        render(&src(1, 128, 255), s.clone(), &a, 1),
        render(&src(8, 128, 255), s, &a, 13)
    );
}
#[test]
fn invert_changes_selection_but_not_full_cell_color() {
    let a = atlas();
    let source = src(1, 255, 255);
    let mut s = settings(12, 20);
    let normal = render(&source, s.clone(), &a, 11);
    s.invert = true;
    let inv = render(&source, s, &a, 11);
    assert_ne!(normal, inv); // opposite bits, same full-cell tone RGB
}
#[test]
fn partial_crop_rotation_scale_and_cooperative_steps() {
    let a = atlas();
    let source = SourceImage::new(
        17,
        13,
        [128, 128, 128, 255].repeat(17 * 13),
        MAX_SOURCE_BYTES,
    )
    .unwrap();
    for rotation in [0, 90, 180, 270] {
        for scale in [1, 2, 4] {
            let mut s = settings(
                if rotation % 180 == 0 {
                    17 * scale
                } else {
                    13 * scale
                },
                if rotation % 180 == 0 {
                    13 * scale
                } else {
                    17 * scale
                },
            );
            s.rotation = rotation;
            s.scale = scale;
            s.font_size = 5;
            s.contrast = 20.;
            let out = render(&source, s.clone(), &a, 1);
            assert_eq!(out.len(), s.width as usize * s.height as usize * 4);
            // Partial cells reveal the darkened filter border; complete glyphs
            // retain their tone and every backdrop pixel is opaque.
            assert!(out
                .chunks_exact(4)
                .all(|v| v[0] <= 128 && v[0] == v[1] && v[1] == v[2] && v[3] == 255));
            assert_eq!(out, render(&source, s, &a, 999));
        }
    }
    let mut s = settings(9, 7);
    s.font_size = 5;
    s.crop = Crop {
        x: 4. / 17.,
        y: 3. / 13.,
        width: 9. / 17.,
        height: 7. / 13.,
    };
    assert!(render(&source, s, &a, 5)
        .chunks_exact(4)
        .all(|v| v[0] <= 128 && v[0] == v[1] && v[1] == v[2] && v[3] == 255));
}
#[test]
fn alpha_hidden_rgb_and_zero_threshold() {
    let a = atlas();
    let mut p = vec![];
    for y in 0..20 {
        for x in 0..12 {
            p.extend(if (x + y) % 2 == 0 {
                [255, 0, 0, 255]
            } else {
                [0, 0, 255, 0]
            });
        }
    }
    let source = SourceImage::new(12, 20, p, MAX_SOURCE_BYTES).unwrap();
    let mut s = settings(12, 20);
    s.family = Family::Braille { threshold: 0. };
    let out = render(&source, s.clone(), &a, 7);
    assert!(out.chunks_exact(4).all(|v| v[1] == 0 && v[2] == 0));
    let clear = src(255, 255, 0);
    assert!(render(&clear, s, &a, 1)
        .chunks_exact(4)
        .all(|p| p == [0, 0, 0, 255]));
}
#[test]
fn atlas_rejections_identity_and_cancellation_release() {
    let a = atlas();
    let source = src(1, 255, 255);
    let s = settings(12, 20);
    let bad = ReferenceAtlas::new(256, 8, 1, vec![255; 256 * 8], 0., 0., 65535).unwrap();
    assert!(matches!(
        BrailleJob::new(&source, s.clone(), &bad, 0),
        Err(RenderError::InvalidInput)
    ));
    let short = ReferenceAtlas::new(2, 1, 1, vec![0, 255], 0., 0., 65535).unwrap();
    assert!(BrailleJob::new(&source, s.clone(), &short, 0).is_err());
    let mut no_full = vec![0; 256 * 8];
    no_full[8] = 255;
    let bad = ReferenceAtlas::new(256, 8, 1, no_full, 0., 0., 65535).unwrap();
    assert!(BrailleJob::new(&source, s.clone(), &bad, 0).is_err());
    let mut shifted = s.clone();
    shifted.atlas_origin_x = 1.;
    assert!(BrailleJob::new(&source, shifted, &a, 0).is_err());
    let mut j = BrailleJob::new(&source, s.clone(), &a, 0).unwrap();
    assert!(j.storage_bytes() > 0);
    assert_eq!(j.step(&source, &a, 1).unwrap(), JobStatus::Pending);
    j.cancel();
    assert_eq!(j.storage_bytes(), 0);
    assert_eq!(j.step(&source, &a, 10).unwrap(), JobStatus::Cancelled);
    assert!(j.take_frame().is_none());
    let mut j = BrailleJob::new(&source, s, &a, 0).unwrap();
    assert!(j.step(&source, &atlas(), 1).is_err());
    assert_eq!(j.storage_bytes(), 0);
}
#[test]
fn exact_budget_and_one_byte_short() {
    let a = atlas();
    let original = src(1, 255, 255);
    let source = SourceImage::new(12, 20, original.rgba().to_vec(), MAX_SOURCE_BYTES).unwrap();
    let s = settings(12, 20);
    let other = a.storage_bytes();
    let peak = BrailleJob::estimated_peak_bytes(&source, &s, &a, other).unwrap();
    let exact = SourceImage::new(12, 20, source.rgba().to_vec(), peak).unwrap();
    let mut j = BrailleJob::new(&exact, s.clone(), &a, other).unwrap();
    while j.step(&exact, &a, 7).unwrap() == JobStatus::Pending {}
    assert_eq!(j.take_frame().unwrap().rgba.len(), 960);
    assert_eq!(j.storage_bytes(), 0);
    let short = SourceImage::new(12, 20, source.rgba().to_vec(), peak - 1).unwrap();
    assert!(matches!(
        BrailleJob::new(&short, s, &a, other),
        Err(RenderError::BudgetExceeded)
    ));
}
#[test]
fn changed_source_releases_pending_storage() {
    let a = atlas();
    let source = src(1, 255, 255);
    let changed = src(8, 255, 255);
    let mut j = BrailleJob::new(&source, settings(12, 20), &a, 0).unwrap();
    assert_eq!(j.step(&changed, &a, 1), Err(RenderError::MissingSource));
    assert_eq!(j.storage_bytes(), 0);
}
