use asciimorph_engine::{
    character::{CharacterSettings, Crop, RenderError},
    color::{prepare, tone},
    source::{sample_source, transform, transform_view, SourceImage},
};
use std::borrow::Cow;

#[test]
fn transparent_source_does_not_bleed() {
    let source = SourceImage::new(2, 1, vec![255, 0, 0, 0, 0, 0, 255, 255], 4096).unwrap();
    assert_eq!(
        sample_source(&source, 1, 1).unwrap(),
        vec![0.0, 0.0, 255.0, 0.5]
    );
    let settings = CharacterSettings::new(1, 1).unwrap();
    let p = prepare(&source, &settings).unwrap();
    assert_eq!(p.rgb, vec![0.0, 0.0, 255.0]);
    assert_eq!(p.alpha, vec![0.5]);
    assert!(matches!(
        transform_view(&source, &settings).unwrap(),
        Cow::Borrowed(_)
    ));
}
#[test]
fn crop_then_rotate_matches_labeled_pixels() {
    let bytes = (1..=6).flat_map(|n| [n, 0, 0, 255]).collect();
    let source = SourceImage::new(3, 2, bytes, 8192).unwrap();
    let mut settings = CharacterSettings::new(2, 2).unwrap();
    settings.crop = Crop {
        x: 1.0 / 3.0,
        y: 0.0,
        width: 2.0 / 3.0,
        height: 1.0,
    };
    settings.rotation = 90;
    let image = transform(&source, &settings).unwrap();
    assert_eq!((image.width(), image.height()), (2, 2));
    assert_eq!(
        image
            .rgba()
            .chunks_exact(4)
            .map(|p| p[0])
            .collect::<Vec<_>>(),
        vec![5, 2, 6, 3]
    );
    settings.rotation = 270;
    assert_eq!(
        transform(&source, &settings)
            .unwrap()
            .rgba()
            .chunks_exact(4)
            .map(|p| p[0])
            .collect::<Vec<_>>(),
        vec![3, 6, 2, 5]
    );
}
#[test]
fn tone_extrema_and_gamma() {
    assert_eq!(tone(127.5, 0.0, 0.0, 1.0), 127.5);
    assert_eq!(tone(0.0, -100.0, 100.0, 1.0), 0.0);
    assert_eq!(tone(255.0, 100.0, 100.0, 1.0), 255.0);
    assert!((tone(63.75, 0.0, 0.0, 2.0) - 127.5).abs() < 1e-10);
    let mut s = CharacterSettings::new(1, 1).unwrap();
    for gamma in [0.0, f64::NAN, f64::INFINITY, 3.1] {
        s.gamma = gamma;
        assert_eq!(s.validate(), Err(RenderError::InvalidInput));
    }
    s.gamma = 1.0;
    s.version = 2;
    assert_eq!(s.validate(), Err(RenderError::UnsupportedVersion));
}
#[test]
fn rejects_bad_dimensions_and_peak_budget() {
    assert_eq!(
        SourceImage::new(0, 1, vec![], 4096).unwrap_err(),
        RenderError::InvalidInput
    );
    assert_eq!(
        SourceImage::new(16385, 1, vec![], 4096).unwrap_err(),
        RenderError::InvalidInput
    );
    assert_eq!(
        SourceImage::new(2, 1, vec![0; 4], 4096).unwrap_err(),
        RenderError::InvalidInput
    );
    assert_eq!(
        SourceImage::new(1, 1, vec![0; 4], 3).unwrap_err(),
        RenderError::BudgetExceeded
    );
    assert!(CharacterSettings::new(60001, 1).is_err());
    let source = SourceImage::new(1, 1, vec![0; 4], 100).unwrap();
    let settings = CharacterSettings::new(2, 2).unwrap();
    assert_eq!(
        prepare(&source, &settings).unwrap_err(),
        RenderError::BudgetExceeded
    );
    assert!(sample_source(&source, usize::MAX, 2).is_err());
}
#[test]
fn numeric_stages_preserve_float32_boundaries() {
    let source = SourceImage::new(
        3,
        1,
        vec![0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255],
        16384,
    )
    .unwrap();
    let mut s = CharacterSettings::new(3, 1).unwrap();
    s.sharpness = 25.0;
    s.edge = 0.0;
    let p = prepare(&source, &s).unwrap();
    assert_eq!(p.values, vec![0.0, 128.0, 255.0]);
    assert!(
        (p.filtered[1] as f64 - (128.0f64 + (128.0 - (0.0 + 128.0 + 255.0) / 3.0))).abs() < 0.00002
    );
    s.edge = 100.0;
    s.density = 2.0;
    let p = prepare(&source, &s).unwrap();
    assert_eq!(p.filtered, vec![255.0; 3]);
}
#[test]
fn retained_capacity_counts_toward_budget() {
    let mut pixels = Vec::with_capacity(1024);
    pixels.extend_from_slice(&[0, 0, 0, 255]);
    assert_eq!(
        SourceImage::new(1, 1, pixels, 512).unwrap_err(),
        RenderError::BudgetExceeded
    );
}
#[test]
fn full_geometry_rotation_and_crop_rounding() {
    let source =
        SourceImage::new(3, 2, (1..=6).flat_map(|n| [n, 0, 0, 255]).collect(), 8192).unwrap();
    let mut s = CharacterSettings::new(1, 1).unwrap();
    s.rotation = 180;
    assert_eq!(
        transform(&source, &s)
            .unwrap()
            .rgba()
            .chunks_exact(4)
            .map(|p| p[0])
            .collect::<Vec<_>>(),
        vec![6, 5, 4, 3, 2, 1]
    );
    s.rotation = 0;
    s.crop = Crop {
        x: 0.5,
        y: 0.5,
        width: 0.5,
        height: 0.5,
    };
    let transformed = transform(&source, &s).unwrap();
    assert_eq!((transformed.width(), transformed.height()), (2, 1));
    assert_eq!(transformed.rgba()[0], 5);
    s.crop = Crop {
        x: 1.0,
        y: 1.0,
        width: 0.00000001,
        height: 0.00000001,
    };
    assert_eq!(transform(&source, &s).unwrap().rgba()[0], 6);
}
