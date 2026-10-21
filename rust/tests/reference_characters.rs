//! Independently authored numeric fixtures; not reference runtime/font-pixel parity.
use asciimorph_engine::{
    character::{Crop, JobStatus, RenderError, TRANSPARENT_GLYPH_INDEX},
    reference_characters::{
        ramp_index, reference_tone, ReferenceAtlas, ReferenceBackdrop, ReferenceCharactersJob,
        ReferenceCharactersSettings,
    },
    source::SourceImage,
};
const BUDGET: usize = 268_435_456;
fn source(w: u32, h: u32, mut f: impl FnMut(u32, u32) -> [u8; 4]) -> SourceImage {
    let mut bytes = Vec::new();
    for y in 0..h {
        for x in 0..w {
            bytes.extend(f(x, y));
        }
    }
    SourceImage::new(w, h, bytes, BUDGET).unwrap()
}
fn settings(w: u32, h: u32) -> ReferenceCharactersSettings {
    ReferenceCharactersSettings {
        version: 1,
        frame_width: w,
        frame_height: h,
        font_size: 3.,
        render_scale: 1,
        brightness: 0.,
        contrast: 0.,
        crop: Crop {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        },
        rotation: 0,
        backdrop: ReferenceBackdrop::None,
    }
}
fn atlas() -> ReferenceAtlas {
    ReferenceAtlas::new(3, 1, 1, vec![255, 128, 0], 0., 0., 65535).unwrap()
}
fn run(
    s: &SourceImage,
    a: &ReferenceAtlas,
    settings: ReferenceCharactersSettings,
    chunk: u32,
) -> asciimorph_engine::reference_characters::ReferenceGlyphLayer {
    let mut job = ReferenceCharactersJob::new(s, settings, a, 0).unwrap();
    let mut n = 0;
    while job.status() == JobStatus::Pending {
        job.step(s, a, chunk).unwrap();
        n += 1;
        assert!(n < 1_000_000);
    }
    job.take_glyph_layer().unwrap()
}
#[test]
fn center_lookup_floor_grid_and_full_margins() {
    let s = source(5, 3, |x, _| {
        if x == 0 {
            [0, 0, 0, 255]
        } else if x == 2 {
            [200, 100, 50, 128]
        } else {
            [255, 255, 255, 255]
        }
    });
    let f = run(&s, &atlas(), settings(5, 3), 1);
    let g = f.grid.unwrap();
    assert_eq!((g.width, g.height), (2, 1));
    assert!((g.cell_width - 1.8).abs() < 1e-12);
    assert_eq!(g.glyph_indices, vec![65535, 0]);
    assert_eq!(&g.foreground[4..8], &[200, 100, 50, 128]);
    assert_eq!(g.alpha[1], 128. / 255.);
    assert_eq!((f.width, f.height, f.rgba.len()), (5, 3, 60));
    assert_eq!(&f.rgba[16..20], &[0, 0, 0, 0]);
}
#[test]
fn explicit_scale_divides_centers_not_grid_width() {
    let s = source(5, 3, |x, _| {
        let v = if x == 2 { 200 } else { 0 };
        [v, v, v, 255]
    });
    let mut t = settings(20, 12);
    t.render_scale = 4;
    let g = run(&s, &atlas(), t, 500).grid.unwrap();
    assert_eq!(g.glyph_indices, vec![65535, 0]);
}
#[test]
fn sampled_range_ignores_unprobed_extrema_and_transparent_hidden_rgb() {
    // 80x80 cells => stride2: center(odd col1)=x2 is never probed.
    let s = source(144, 240, |x, _| {
        let v = if x == 0 {
            50
        } else if x == 2 {
            255
        } else {
            100
        };
        [v, v, v, 255]
    });
    let f = run(&s, &atlas(), settings(144, 240), 199);
    let g = f.grid.unwrap();
    assert_eq!(g.glyph_indices[0], 65535);
    assert_eq!(g.glyph_indices[1], 0);
    assert_eq!(g.glyph_indices[2], 0);
    let hidden = |v| {
        source(5, 3, |x, _| {
            if x == 0 {
                [v, v, v, 0]
            } else {
                [100, 100, 100, 128]
            }
        })
    };
    assert_eq!(
        run(&hidden(0), &atlas(), settings(5, 3), 1),
        run(&hidden(255), &atlas(), settings(5, 3), 7)
    );
}
#[test]
fn flat_range_and_no_eligible_probes_skip_every_cell() {
    for alpha in [0, 255] {
        let s = source(5, 3, |_, _| [120, 120, 120, alpha]);
        let f = run(&s, &atlas(), settings(5, 3), 1);
        assert!(f.rgba.iter().all(|&v| v == 0));
        assert_eq!(f.grid.unwrap().glyph_indices, vec![65535; 2]);
    }
}
#[test]
fn direct_input_order_thresholds_and_counts() {
    assert_eq!(ramp_index(0.41, 3), None);
    assert_eq!(ramp_index(0.42, 3), Some(1));
    assert_eq!(ramp_index(0.5, 3), Some(1));
    assert_eq!(ramp_index(1., 3), Some(0));
    assert_eq!(ramp_index(0.42, 256), Some(148));
    assert_eq!(ramp_index(1., 2), Some(0));
}
#[test]
fn raw_tone_vectors_use_128_pivot_and_nearest_rounding() {
    // Explicit Decimal-derived expected bytes; not snapshots of the implementation.
    let cases = [
        (-100., -100., [0, 0, 0, 0]),
        (-100., 0., [72, 128, 128, 184]),
        (-100., 100., [255; 4]),
        (0., -100., [0; 4]),
        (0., 0., [0, 127, 128, 255]),
        (0., 100., [255; 4]),
        (20., -100., [0, 0, 0, 21]),
        (20., 0., [0, 127, 128, 255]),
        (20., 100., [233, 255, 255, 255]),
        (100., -100., [0, 0, 0, 161]),
        (100., 0., [0, 126, 128, 255]),
        (100., 100., [93, 255, 255, 255]),
    ];
    for (c, b, want) in cases {
        for (i, x) in [0, 127, 128, 255].into_iter().enumerate() {
            assert_eq!(reference_tone(x, b, c), want[i]);
        }
    }
}
#[test]
fn color_tone_does_not_change_selection_or_partial_alpha() {
    let s = source(7, 3, |x, _| {
        let v = if x == 0 {
            0
        } else if x == 2 {
            128
        } else {
            255
        };
        [v, v, v, 128]
    });
    let a = atlas();
    let f = run(&s, &a, settings(7, 3), 1);
    let mut t = settings(7, 3);
    t.brightness = 40.;
    t.contrast = -100.;
    let q = run(&s, &a, t, 3);
    assert_eq!(
        f.grid.as_ref().unwrap().glyph_indices,
        q.grid.as_ref().unwrap().glyph_indices
    );
    assert_eq!(
        f.grid.as_ref().unwrap().alpha,
        q.grid.as_ref().unwrap().alpha
    );
    assert_ne!(f.grid.unwrap().foreground, q.grid.unwrap().foreground);
}
#[test]
fn literal_space_is_explicit_and_empty_dot_retains_index() {
    let s = source(5, 3, |x, _| {
        let v = if x == 0 { 0 } else { 255 };
        [v, v, v, 255]
    });
    for (space, expected) in [(0, 65535), (1, 0), (65535, 0)] {
        let a = ReferenceAtlas::new(2, 1, 1, vec![0, 255], 0., 0., space).unwrap();
        let f = run(&s, &a, settings(5, 3), 1);
        assert!(f.rgba.iter().all(|&v| v == 0));
        let g = f.grid.unwrap();
        assert_eq!(g.glyph_indices[1], expected);
        assert_eq!(g.alpha[1], if expected == 65535 { 0. } else { 1. });
    }
    for count in [2, 256] {
        for invalid in [count, 256, 32768, 65534] {
            assert!(
                ReferenceAtlas::new(count, 1, 1, vec![0; count as usize], 0., 0., invalid).is_err()
            );
        }
        assert!(ReferenceAtlas::new(count, 1, 1, vec![0; count as usize], 0., 0., 65535).is_ok());
    }
}
#[test]
fn fractional_mask_has_quarter_weights_zero_outside_and_negative_origin() {
    let s = source(5, 3, |x, _| {
        let v = if x == 0 { 0 } else { 255 };
        [v, v, v, 255]
    });
    // Second glyph anchor=1.8-1.3=.5 in X and .5 in Y.
    let a = ReferenceAtlas::new(2, 2, 1, vec![255, 0, 0, 0], -1.3, 0.5, 65535).unwrap();
    let f = run(&s, &a, settings(5, 3), 1);
    for y in 0..2 {
        for x in 0..2 {
            assert_eq!(
                &f.rgba[(y * 5 + x) * 4..(y * 5 + x) * 4 + 4],
                &[255, 255, 255, 64]
            );
        }
    }
    assert_eq!(&f.rgba[8..12], &[0, 0, 0, 0]);
}
#[test]
fn opaque_border_does_not_edge_clamp_and_overlap_is_row_major() {
    let s = source(7, 3, |x, _| {
        if x == 0 {
            [0, 0, 0, 255]
        } else if x == 2 {
            [255, 0, 0, 255]
        } else {
            [0, 255, 0, 255]
        }
    });
    let a = ReferenceAtlas::new(2, 4, 1, vec![128; 8], -1., 0., 65535).unwrap();
    let f = run(&s, &a, settings(7, 3), 1);
    assert_eq!(f.rgba[3], 26); // x0 samples only 20% of alpha128 at anchor .8.
    let overlap = &f.rgba[12..16];
    assert!(overlap[1] > overlap[0]);
    assert!(overlap[3] > 128);
    let reversed = source(7, 3, |x, _| {
        if x == 0 {
            [0, 0, 0, 255]
        } else if x == 2 {
            [0, 255, 0, 255]
        } else {
            [255, 0, 0, 255]
        }
    });
    let reversed = run(&reversed, &a, settings(7, 3), 3);
    let overlap = &reversed.rgba[12..16];
    assert!(overlap[0] > overlap[1]);
}
#[test]
fn zero_grid_has_full_transparent_frame_and_nullable_grid() {
    let s = source(5, 3, |_, _| [255; 4]);
    let mut t = settings(5, 3);
    t.font_size = 80.;
    let f = run(&s, &atlas(), t, 1);
    assert!(f.grid.is_none());
    assert_eq!(f.rgba, vec![0; 60]);
}
#[test]
fn crop_uses_floor_left_ceil_right_then_inverse_quarter_rotation() {
    let s = source(6, 5, |x, y| [x as u8 * 40, y as u8 * 40, 0, 255]);
    let mut t = settings(4, 4);
    t.crop = Crop {
        x: 0.2,
        y: 0.1,
        width: 0.5,
        height: 0.6,
    };
    t.rotation = 90;
    // crop [1,5)x[0,4), inverse(0,1)->source(2,3), inverse(2,1)->source(2,1)
    let a = ReferenceAtlas::new(2, 1, 1, vec![255; 2], 0., 0., 65535).unwrap();
    let g = run(&s, &a, t, 1).grid.unwrap();
    assert_eq!(&g.foreground[0..4], &[80, 120, 0, 255]);
    assert_eq!(g.glyph_indices[1], TRANSPARENT_GLYPH_INDEX);
}
#[test]
fn slices_cancel_and_identity_are_enforced_without_cloning_inputs() {
    let s = source(7, 3, |x, _| [x as u8 * 30, x as u8 * 30, 0, 255]);
    let a = atlas();
    assert_eq!(
        run(&s, &a, settings(7, 3), 1),
        run(&s, &a, settings(7, 3), 10000)
    );
    let mut j = ReferenceCharactersJob::new(&s, settings(7, 3), &a, 0).unwrap();
    assert_eq!(j.step(&s, &a, 0), Ok(JobStatus::Pending));
    assert!(j.take_glyph_layer().is_none());
    assert_eq!(j.step(&s.clone(), &a, 1), Err(RenderError::MissingSource));
    let other = atlas();
    assert_eq!(j.step(&s, &other, 1), Err(RenderError::MissingCalibration));
    j.cancel();
    assert_eq!(j.status(), JobStatus::Cancelled);
    assert!(j.take_glyph_layer().is_none());
    assert_eq!(j.storage_bytes(), 0);
    // A wide mask is split at individual destination pixels, not one glyph per work unit.
    let large = ReferenceAtlas::new(2, 100, 100, vec![255; 20000], 0., 0., 65535).unwrap();
    let mut j = ReferenceCharactersJob::new(&s, settings(7, 3), &large, 0).unwrap();
    assert_eq!(j.step(&s, &large, 32), Ok(JobStatus::Pending));
}
#[test]
fn constructors_reject_bad_fields_and_preflight_retained_capacity_and_budget() {
    let s = source(5, 3, |_, _| [0; 4]);
    let a = atlas();
    for mutate in [
        |t: &mut ReferenceCharactersSettings| t.version = 2,
        |t: &mut ReferenceCharactersSettings| t.font_size = f64::NAN,
        |t: &mut ReferenceCharactersSettings| t.render_scale = 0,
        |t: &mut ReferenceCharactersSettings| t.frame_width = 6,
        |t: &mut ReferenceCharactersSettings| t.rotation = 45,
        |t: &mut ReferenceCharactersSettings| t.brightness = 101.,
        |t: &mut ReferenceCharactersSettings| t.contrast = -101.,
        |t: &mut ReferenceCharactersSettings| t.backdrop = ReferenceBackdrop::Blur,
        |t: &mut ReferenceCharactersSettings| t.backdrop = ReferenceBackdrop::Solid,
    ] {
        let mut t = settings(5, 3);
        mutate(&mut t);
        assert!(ReferenceCharactersJob::new(&s, t, &a, 0).is_err());
    }
    for (x, y) in [(f64::NAN, 0.), (2., 0.), (0., -2.)] {
        assert!(ReferenceAtlas::new(2, 1, 1, vec![0; 2], x, y, 65535).is_err());
    }
    let required =
        ReferenceCharactersJob::estimated_peak_bytes(&s, &settings(5, 3), &a, 0).unwrap();
    assert!(ReferenceCharactersJob::new(&s, settings(5, 3), &a, BUDGET - required + 1).is_err());
    let mut masks = Vec::with_capacity(16 * 1024 * 1024 + 1);
    masks.extend([0, 0]);
    assert!(ReferenceAtlas::new(2, 1, 1, masks, 0., 0., 65535).is_err());
    let oversized = source(600, 600, |_, _| [0; 4]);
    assert!(ReferenceCharactersJob::new(&oversized, settings(600, 600), &a, 0).is_err());
    let full = source(4200, 4200, |_, _| [0; 4]);
    let mut t = settings(16800, 16800);
    t.render_scale = 4;
    t.font_size = 80.;
    assert!(ReferenceCharactersJob::new(&full, t, &a, 0).is_err());
}

#[test]
fn collapsed_crop_extent_rejects_but_nonempty_tiny_crop_is_valid() {
    let s = source(5, 3, |_, _| [255; 4]);
    let a = atlas();
    let mut t = settings(1, 3);
    t.crop = Crop {
        x: 1.,
        y: 0.,
        width: f64::MIN_POSITIVE,
        height: 1.,
    };
    assert!(ReferenceCharactersJob::new(&s, t, &a, 0).is_err());
    let mut t = settings(1, 3);
    t.crop = Crop {
        x: 0.,
        y: 0.,
        width: f64::MIN_POSITIVE,
        height: 1.,
    };
    assert!(ReferenceCharactersJob::new(&s, t, &a, 0).is_ok());
    let mut t = settings(5, 1);
    t.crop = Crop {
        x: 0.,
        y: 1.,
        width: 1.,
        height: f64::MIN_POSITIVE,
    };
    assert!(ReferenceCharactersJob::new(&s, t, &a, 0).is_err());
}
#[test]
fn alpha_rounding_zero_has_canonical_transparent_rgb() {
    let s = source(5, 3, |x, _| {
        if x == 0 {
            [0, 0, 0, 255]
        } else {
            [255, 255, 255, 1]
        }
    });
    let a = ReferenceAtlas::new(2, 1, 1, vec![1, 0], 0., 0., 65535).unwrap();
    let f = run(&s, &a, settings(5, 3), 1);
    assert!(f.rgba.iter().all(|&v| v == 0));
    assert_eq!(f.grid.unwrap().glyph_indices[1], 0);
}
#[test]
fn preflight_charges_source_capacity_and_other_jobs_before_output_allocation() {
    let mut bytes = Vec::with_capacity(65536);
    bytes.resize(60, 255);
    let s = SourceImage::new(5, 3, bytes, 65537).unwrap();
    let a = atlas();
    assert_eq!(
        ReferenceCharactersJob::new(&s, settings(5, 3), &a, 0).unwrap_err(),
        RenderError::BudgetExceeded
    );
    let s = source(5, 3, |_, _| [255; 4]);
    let peak = ReferenceCharactersJob::estimated_peak_bytes(&s, &settings(5, 3), &a, 0).unwrap();
    assert!(ReferenceCharactersJob::new(&s, settings(5, 3), &a, BUDGET - peak).is_ok());
    assert_eq!(
        ReferenceCharactersJob::new(&s, settings(5, 3), &a, usize::MAX).unwrap_err(),
        RenderError::BudgetExceeded
    );
}
#[test]
fn brightness_preserves_reference_operation_order_at_half_byte_ties() {
    assert_eq!(reference_tone(0, 50., 0.), 128);
    assert_eq!(reference_tone(128, -50., 0.), 1);
    assert_eq!(reference_tone(255, -50., 0.), 128);
}

#[test]
fn one_pixel_mask_half_displacement_has_four_quarter_weights() {
    let s = source(5, 3, |x, _| if x == 0 { [0, 0, 0, 255] } else { [255; 4] });
    let a = ReferenceAtlas::new(2, 1, 1, vec![255, 0], 0.7, 0.5, 65535).unwrap();
    let f = run(&s, &a, settings(5, 3), 1);
    for y in 0..2 {
        for x in 2..4 {
            assert_eq!(
                &f.rgba[(y * 5 + x) * 4..(y * 5 + x) * 4 + 4],
                &[255, 255, 255, 64]
            );
        }
    }
    assert_eq!(&f.rgba[16..20], &[0, 0, 0, 0]);
}
