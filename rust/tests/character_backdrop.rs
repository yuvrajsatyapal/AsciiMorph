use asciimorph_engine::{
    character::{Crop, JobStatus, RenderError},
    character_backdrop::{box_radii, CompleteCharactersJob},
    reference_characters::{ReferenceAtlas, ReferenceBackdrop, ReferenceCharactersSettings},
    source::SourceImage,
};
fn settings(w: u32, h: u32, scale: u8, backdrop: ReferenceBackdrop) -> ReferenceCharactersSettings {
    ReferenceCharactersSettings {
        version: 1,
        frame_width: w,
        frame_height: h,
        font_size: 80.,
        render_scale: scale,
        brightness: 0.,
        contrast: 0.,
        crop: Crop {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        },
        rotation: 0,
        backdrop,
    }
}
fn atlas() -> ReferenceAtlas {
    ReferenceAtlas::new(2, 1, 1, vec![0, 0], 0., 0., 65535).unwrap()
}
fn source(w: u32, h: u32, p: Vec<u8>) -> SourceImage {
    SourceImage::new(w, h, p, 256 * 1024 * 1024).unwrap()
}
fn frame(src: &SourceImage, s: ReferenceCharactersSettings, chunk: u32) -> Vec<u8> {
    let a = atlas();
    let mut j = CompleteCharactersJob::new(src, s, &a, 0).unwrap();
    while j.step(src, &a, chunk).unwrap() != JobStatus::Complete {}
    j.take_frame().unwrap().rgba
}
#[test]
fn exact_radii_and_integer_variances() {
    for (s, r, v3) in [
        (1, [7, 7, 8], 184),
        (2, [15, 15, 16], 752),
        (3, [23, 23, 24], 1704),
        (4, [31, 31, 32], 3040),
    ] {
        assert_eq!(box_radii(s).unwrap(), r);
        assert_eq!(r.iter().map(|&r| r * (r + 1)).sum::<usize>(), v3);
        let sigma3 = 192 * s as usize * s as usize;
        // Three times variance: sum r(r+1); replacing a lower width raises it by16S.
        assert!(
            (v3 as isize - sigma3 as isize).abs()
                <= (v3 as isize + 16 * s as isize - sigma3 as isize).abs()
        );
    }
    assert!(box_radii(0).is_err());
}
#[test]
fn constant_partial_alpha_and_zero_grid_all_contexts() {
    let src = source(2, 1, [30, 90, 180, 128].repeat(2));
    for (b, p) in [
        (ReferenceBackdrop::None, [0, 0, 0, 0]),
        (ReferenceBackdrop::Solid, [0, 0, 0, 255]),
        (ReferenceBackdrop::Blur, [30, 90, 180, 128]),
    ] {
        assert_eq!(frame(&src, settings(2, 1, 1, b), 1), p.repeat(2));
    }
}
#[test]
fn independent_three_uniform_box_impulse_coefficients() {
    let mut p = [0, 0, 0, 255].repeat(101);
    p[50 * 4..50 * 4 + 3].fill(255);
    let src = source(101, 1, p);
    let out = frame(&src, settings(101, 1, 1, ReferenceBackdrop::Blur), 7);
    // Independent convolution counts: 183/3825,120/3825,1/3825.
    for (offset, count) in [(0, 183), (8, 120), (22, 1)] {
        let expected = (255. * count as f64 / 3825.).round() as u8;
        assert_eq!(
            &out[(50 + offset) * 4..(50 + offset) * 4 + 4],
            &[expected, expected, expected, 255]
        );
    }
}
#[test]
fn alpha_weighted_resize_and_blur_have_no_hidden_red_fringe() {
    let src = source(2, 1, vec![255, 0, 0, 0, 0, 0, 255, 255]);
    let out = frame(&src, settings(8, 4, 4, ReferenceBackdrop::Blur), 3);
    for p in out.chunks_exact(4) {
        assert_eq!(&p[..3], &[0, 0, 255]);
        assert!(p[3] > 0 && p[3] < 255);
    }
    let src = source(1, 1, vec![255, 80, 20, 0]);
    assert_eq!(
        frame(&src, settings(4, 4, 4, ReferenceBackdrop::Blur), 1),
        vec![0; 64]
    );
}
#[test]
fn cooperative_chunk_identity_cancel_and_budget_floor() {
    let src = source(3, 2, [30, 90, 180, 128].repeat(6));
    let a = atlas();
    let s = settings(12, 8, 4, ReferenceBackdrop::Blur);
    assert_eq!(frame(&src, s.clone(), 1), frame(&src, s.clone(), 4096));
    let peak = CompleteCharactersJob::estimated_peak_bytes(&src, &s, &a, 0).unwrap();
    assert!(peak >= 48 * 96 + src.storage_bytes() + a.storage_bytes());
    assert_eq!(
        CompleteCharactersJob::new(&src, s.clone(), &a, 256 * 1024 * 1024).unwrap_err(),
        RenderError::BudgetExceeded
    );
    for steps in [0, 1, 2, 96, 97, 400, 700] {
        let mut j = CompleteCharactersJob::new(&src, s.clone(), &a, 0).unwrap();
        j.step(&src, &a, steps).unwrap();
        j.cancel();
        assert_eq!(j.status(), JobStatus::Cancelled);
        assert_eq!(j.storage_bytes(), 0);
        assert!(j.take_frame().is_none());
    }
    let mut j = CompleteCharactersJob::new(&src, s, &a, 0).unwrap();
    let other = source(3, 2, [30, 90, 180, 128].repeat(6));
    assert_eq!(j.step(&other, &a, 1), Err(RenderError::MissingSource));
    assert_eq!(j.storage_bytes(), 0);
}
#[test]
fn independently_enumerated_edge_kernel_matches_clamp_not_zero_padding() {
    let mut p = [0, 0, 0, 255].repeat(101);
    p[..3].fill(255);
    let src = source(101, 1, p);
    let out = frame(&src, settings(101, 1, 1, ReferenceBackdrop::Blur), 17);
    for x in [0isize, 1, 7, 8, 15, 22, 23, 50] {
        // Enumerate paths through three clamped boxes, independent of moving sums.
        let mut hits = 0usize;
        for d3 in -8..=8 {
            for d2 in -7..=7 {
                for d1 in -7..=7 {
                    let i3 = (x + d3).clamp(0, 100);
                    let i2 = (i3 + d2).clamp(0, 100);
                    let i1 = (i2 + d1).clamp(0, 100);
                    if i1 == 0 {
                        hits += 1;
                    }
                }
            }
        }
        let byte = (255. * hits as f64 / 3825.).round() as u8;
        assert_eq!(
            &out[x as usize * 4..x as usize * 4 + 4],
            &[byte, byte, byte, 255]
        );
    }
}
#[test]
fn oriented_crop_resize_uses_pixel_centers_and_retains_all_margins() {
    // Single prepared pixel selected by ceil/floor crop, then rotated. Every S4
    // destination tap clamps to that same original pixel, including full margins.
    let src = source(
        3,
        2,
        vec![
            255, 0, 0, 0, 20, 40, 160, 128, 0, 255, 0, 255, 255, 255, 0, 255, 0, 0, 255, 255, 255,
            0, 255, 255,
        ],
    );
    let mut s = settings(4, 4, 4, ReferenceBackdrop::Blur);
    s.crop = Crop {
        x: 1. / 3.,
        y: 0.,
        width: 1. / 3.,
        height: 0.5,
    };
    for rotation in [0, 90, 180, 270] {
        s.rotation = rotation;
        assert_eq!(frame(&src, s.clone(), 1), [20, 40, 160, 128].repeat(16));
    }
}
#[test]
fn atlas_replacement_cancels_and_frees_all_backdrop_state() {
    let src = source(3, 2, [30, 90, 180, 128].repeat(6));
    let a = atlas();
    let mut j =
        CompleteCharactersJob::new(&src, settings(12, 8, 4, ReferenceBackdrop::Blur), &a, 0)
            .unwrap();
    j.step(&src, &a, 100).unwrap();
    assert_eq!(
        j.step(&src, &atlas(), 1),
        Err(RenderError::MissingCalibration)
    );
    assert_eq!(j.storage_bytes(), 0);
    assert_eq!(j.status(), JobStatus::Cancelled);
}
