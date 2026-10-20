use asciimorph_engine::{
    character::*,
    glyph::{DirectionalIndices, GlyphCalibration},
    source::SourceImage,
};
fn source(w: u32, h: u32, gray: &[u8]) -> SourceImage {
    SourceImage::new(
        w,
        h,
        gray.iter().flat_map(|&v| [v, v, v, 255]).collect(),
        16_000_000,
    )
    .unwrap()
}
fn cal(coverage: Vec<f32>, shapes: Vec<f32>) -> GlyphCalibration {
    GlyphCalibration::new(
        coverage.len() as u16,
        1,
        1,
        vec![255; coverage.len()],
        coverage,
        shapes,
    )
    .unwrap()
}
fn run(
    src: &SourceImage,
    s: CharacterSettings,
    c: Option<&GlyphCalibration>,
    budget: u32,
) -> GlyphGrid {
    let mut j = CharacterJob::new(src, s, c).unwrap();
    while j.step(src, c, budget).unwrap() == JobStatus::Pending {}
    j.take_grid().unwrap()
}
#[test]
fn coverage_order_is_measured_not_character_order() {
    let c = cal(vec![1., 0., 0.5], vec![0.; 27]);
    let g = run(
        &source(3, 1, &[0, 128, 255]),
        CharacterSettings::new(3, 1).unwrap(),
        Some(&c),
        1,
    );
    assert_eq!(g.glyph_indices, vec![1, 2, 0]);
}
#[test]
fn shape_error_selects_matching_orientation() {
    let mut s = CharacterSettings::new(1, 1).unwrap();
    s.shape_aware = true;
    let c = cal(
        vec![1. / 3., 1. / 3.],
        vec![
            0., 1., 0., 0., 1., 0., 0., 1., 0., 0., 0., 0., 1., 1., 1., 0., 0., 0.,
        ],
    );
    let g = run(
        &source(3, 3, &[0, 0, 0, 255, 255, 255, 0, 0, 0]),
        s,
        Some(&c),
        1,
    );
    assert_eq!(g.glyph_indices, vec![1]);
}
#[test]
fn tie_uses_stable_first_index() {
    let c = cal(vec![0.5, 0.5], vec![0.; 18]);
    assert_eq!(
        run(
            &source(1, 1, &[127]),
            CharacterSettings::new(1, 1).unwrap(),
            Some(&c),
            1
        )
        .glyph_indices,
        vec![0]
    );
}
#[test]
fn braille_all_eight_dot_positions() {
    for (pos, code) in [
        0x2801, 0x2808, 0x2802, 0x2810, 0x2804, 0x2820, 0x2840, 0x2880,
    ]
    .into_iter()
    .enumerate()
    {
        let mut p = [0; 8];
        p[pos] = 255;
        let mut s = CharacterSettings::new(1, 1).unwrap();
        s.mapping = Mapping::Braille;
        let g = run(&source(2, 4, &p), s, None, 1);
        assert_eq!(0x2800 + g.glyph_indices[0] as u32, code);
    }
}
#[test]
fn diffusion_crosses_step_boundaries() {
    let src = source(4, 2, &[110; 8]);
    let c = cal(vec![0., 1.], vec![0.; 18]);
    let mut s = CharacterSettings::new(4, 2).unwrap();
    s.dither = Dither::FloydSteinberg;
    let a = run(&src, s.clone(), Some(&c), 1);
    let b = run(&src, s.clone(), Some(&c), 4096);
    assert_eq!(a, b);
    s.dither = Dither::None;
    assert_ne!(a.glyph_indices, run(&src, s, Some(&c), 1).glyph_indices);
}
#[test]
fn mapping_and_output_invert_are_independent() {
    let src = source(1, 1, &[0]);
    let c = cal(vec![0., 1.], vec![0.; 18]);
    let mut s = CharacterSettings::new(1, 1).unwrap();
    s.fg = 0x123456;
    s.bg = Some(0x102030);
    let a = run(&src, s.clone(), Some(&c), 1);
    s.output_invert = true;
    let b = run(&src, s.clone(), Some(&c), 1);
    assert_eq!(a.glyph_indices, b.glyph_indices);
    assert_eq!(b.foreground, [0xed, 0xcb, 0xa9, 255]);
    assert_eq!(b.background, [0xef, 0xdf, 0xcf, 255]);
    assert_eq!(a.alpha, b.alpha);
    s.mapping_invert = true;
    assert_ne!(a.glyph_indices, run(&src, s, Some(&c), 1).glyph_indices);
}
#[test]
fn transparent_cell_is_sentinel() {
    let src = SourceImage::new(1, 1, vec![255, 0, 0, 0], 100000).unwrap();
    let c = cal(vec![0., 1.], vec![0.; 18]);
    let g = run(&src, CharacterSettings::new(1, 1).unwrap(), Some(&c), 1);
    assert_eq!(g.glyph_indices, [65535]);
    assert_eq!(g.foreground[3], 0);
    assert_eq!(g.background[3], 0);
}
#[test]
fn smart_edges_require_explicit_dictionary_indices() {
    let src = source(3, 1, &[0, 128, 255]);
    let mut s = CharacterSettings::new(3, 1).unwrap();
    s.smart_edges = true;
    let c = cal(vec![0., 0.3, 0.6, 1.], vec![0.; 36]);
    assert!(CharacterJob::new(&src, s.clone(), Some(&c)).is_err());
    assert!(c
        .clone()
        .with_directional_indices(DirectionalIndices {
            vertical: 0,
            slash: 1,
            horizontal: 2,
            backslash: 4
        })
        .is_err());
    let c = c
        .with_directional_indices(DirectionalIndices {
            vertical: 0,
            slash: 1,
            horizontal: 2,
            backslash: 3,
        })
        .unwrap();
    assert!(run(&src, s, Some(&c), 1)
        .glyph_indices
        .iter()
        .all(|&v| v == 0));
}
#[test]
fn source_traversal_is_resumable() {
    let src = source(100, 100, &vec![255; 10000]);
    let c = cal(vec![0., 1.], vec![0.; 18]);
    let mut j = CharacterJob::new(&src, CharacterSettings::new(1, 1).unwrap(), Some(&c)).unwrap();
    for _ in 0..9999 {
        assert_eq!(j.step(&src, Some(&c), 1).unwrap(), JobStatus::Pending);
    }
    assert!(j.take_grid().is_none());
    j.cancel();
    assert_eq!(j.step(&src, Some(&c), 1).unwrap(), JobStatus::Cancelled);
}
#[test]
fn calibration_and_job_enforce_capacity_budgets() {
    assert!(GlyphCalibration::new(1, 1, 1, vec![1], vec![0.], vec![0.; 9]).is_err());
    let c = cal(vec![0., 1.], vec![0.; 18]);
    let src = SourceImage::new(1, 1, vec![0; 4], 4).unwrap();
    assert!(matches!(
        CharacterJob::new(&src, CharacterSettings::new(1, 1).unwrap(), Some(&c)),
        Err(RenderError::BudgetExceeded)
    ));
}
#[test]
fn inverse_crop_rotation_matches_standalone_preparation() {
    let src = source(
        4,
        3,
        &[0, 30, 60, 90, 120, 150, 180, 210, 240, 220, 200, 180],
    );
    let c = cal(vec![0., 0.25, 0.5, 0.75, 1.], vec![0.; 45]);
    for rotation in [0, 90, 180, 270] {
        let mut s = CharacterSettings::new(3, 2).unwrap();
        s.crop = Crop {
            x: 0.25,
            y: 0.,
            width: 0.75,
            height: 1.,
        };
        s.rotation = rotation;
        s.gamma = 1.4;
        s.sharpness = 30.;
        s.edge = 20.;
        s.density = 1.2;
        let p = asciimorph_engine::color::prepare(&src, &s).unwrap();
        let expected: Vec<u16> = p
            .filtered
            .iter()
            .map(|&v| {
                let coverage = [0., 0.25, 0.5, 0.75, 1.];
                let mut best = 0;
                for i in 1..coverage.len() {
                    if (coverage[i] - v as f64 / 255.).abs()
                        < (coverage[best] - v as f64 / 255.).abs()
                    {
                        best = i
                    }
                }
                best as u16
            })
            .collect();
        assert_eq!(
            run(&src, s, Some(&c), 1).glyph_indices,
            expected,
            "rotation {rotation}"
        );
    }
}
#[test]
fn shape_sampling_and_packing_are_chunk_invariant() {
    let src = source(7, 5, &(0..35).map(|n| (n * 7) as u8).collect::<Vec<_>>());
    let c = cal(vec![0., 0.5, 1.], vec![0.; 27]);
    let mut s = CharacterSettings::new(3, 2).unwrap();
    s.shape_aware = true;
    s.dither = Dither::FloydSteinberg;
    s.rotation = 270;
    s.mode = ColorMode::Color;
    assert_eq!(
        run(&src, s.clone(), Some(&c), 1),
        run(&src, s, Some(&c), 4096)
    );
}
#[test]
fn zero_work_identity_and_completed_take_are_explicit() {
    let src = source(1, 1, &[255]);
    let c = cal(vec![0., 1.], vec![0.; 18]);
    let mut j = CharacterJob::new(&src, CharacterSettings::new(1, 1).unwrap(), Some(&c)).unwrap();
    assert_eq!(j.step(&src, Some(&c), 0).unwrap(), JobStatus::Pending);
    assert!(j.take_grid().is_none());
    let other = src.clone();
    assert_eq!(j.step(&other, Some(&c), 1), Err(RenderError::MissingSource));
    let other_c = c.clone();
    assert_eq!(
        j.step(&src, Some(&other_c), 1),
        Err(RenderError::MissingCalibration)
    );
    while j.step(&src, Some(&c), 1).unwrap() == JobStatus::Pending {}
    assert!(j.take_grid().is_some());
    assert!(j.take_grid().is_none());
    j.cancel();
    assert_eq!(j.status(), JobStatus::Complete);
}
#[test]
fn shape_target_preserves_legacy_double_precision() {
    let src = source(1, 1, &[128]);
    let mut s = CharacterSettings::new(1, 1).unwrap();
    s.shape_aware = true;
    s.brightness = (0.500000001 * 255. - 128.) / 2.55;
    let mut shapes = vec![0.25; 9];
    shapes.extend([0.75; 9]);
    let c = cal(vec![0.5, 0.5], shapes);
    assert_eq!(run(&src, s, Some(&c), 1).glyph_indices, [1]);
}
#[test]
fn braille_cell_color_uses_alpha_weights_and_independent_background_alpha() {
    let pixels: Vec<u8> = (0..8)
        .flat_map(|i| {
            if i % 2 == 0 {
                [255, 0, 0, 0]
            } else {
                [0, 200, 100, 128]
            }
        })
        .collect();
    let src = SourceImage::new(2, 4, pixels, 100000).unwrap();
    let mut s = CharacterSettings::new(1, 1).unwrap();
    s.mapping = Mapping::Braille;
    s.mode = ColorMode::Color;
    s.bg = Some(0xffffff);
    let g = run(&src, s, None, 1);
    assert_eq!(g.foreground, [0, 200, 100, 64]);
    assert_eq!(g.background, [255, 255, 255, 255]);
    assert!((g.alpha[0] - 128.0 / 255.0 / 2.0).abs() < 1e-7);
}
#[test]
fn retained_calibration_capacity_is_in_job_preflight() {
    let mut masks = Vec::with_capacity(100000);
    masks.extend([0, 255]);
    let c = GlyphCalibration::new(2, 1, 1, masks, vec![0., 1.], vec![0.; 18]).unwrap();
    let src = SourceImage::new(1, 1, vec![0; 4], 1000).unwrap();
    assert!(matches!(
        CharacterJob::new(&src, CharacterSettings::new(1, 1).unwrap(), Some(&c)),
        Err(RenderError::BudgetExceeded)
    ));
}
