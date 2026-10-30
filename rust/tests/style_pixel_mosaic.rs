use asciimorph_engine::{
    character::{Crop, JobStatus, RenderError, MAX_SOURCE_BYTES},
    source::SourceImage,
    styles::{
        contract::{Family, StyleSettings},
        StyleJob,
    },
};
use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
};

thread_local! {static STEP_MAX_ALLOC:Cell<Option<usize>>=const {Cell::new(None)};}
struct StepAllocator;
#[global_allocator]
static ALLOCATOR: StepAllocator = StepAllocator;
unsafe impl GlobalAlloc for StepAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let _ = STEP_MAX_ALLOC.try_with(|v| {
            if let Some(old) = v.get() {
                v.set(Some(old.max(layout.size())))
            }
        });
        System.alloc(layout)
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout)
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        let _ = STEP_MAX_ALLOC.try_with(|v| {
            if let Some(old) = v.get() {
                v.set(Some(old.max(size)))
            }
        });
        System.realloc(ptr, layout, size)
    }
}

fn settings(family: Family, w: u32, h: u32, scale: u32) -> StyleSettings {
    StyleSettings {
        family,
        width: w,
        height: h,
        scale,
        rotation: 0,
        seed: 0,
        time_us: 0.,
        crop: Crop {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        },
        atlas_count: 0,
        atlas_origin_x: 0.,
        atlas_origin_y: 0.,
        space_index: 65535,
        font_size: 5,
        brightness: 0.,
        contrast: 0.,
        invert: false,
        opacity: 100.,
    }
}
fn source(w: u32, h: u32, pixels: Vec<u8>) -> SourceImage {
    SourceImage::new(w, h, pixels, MAX_SOURCE_BYTES).unwrap()
}
fn render(src: &SourceImage, s: StyleSettings, work: u32) -> Vec<u8> {
    let mut j = StyleJob::new(src, s, None, 0).unwrap();
    assert_eq!(j.step(src, None, 0).unwrap(), JobStatus::Pending);
    while j.step(src, None, work).unwrap() == JobStatus::Pending {}
    let f = j.take_frame().unwrap();
    assert!(j.take_frame().is_none());
    f.rgba
}
fn pixel(rgba: &[u8], w: usize, x: usize, y: usize) -> [u8; 4] {
    rgba[(y * w + x) * 4..(y * w + x) * 4 + 4]
        .try_into()
        .unwrap()
}

#[test]
fn gradient_backdrop_matches_chromium_canvas_bytes() {
    use asciimorph_engine::styles::compose::FrameComposer;
    let mut data = Vec::new();
    for y in 0..64u8 {
        for x in 0..128u8 {
            data.extend([2 * x, 4 * y, 255 - 2 * x, if x < 13 { 0 } else { 255 }]);
        }
    }
    let src = source(128, 64, data);
    let mut job = FrameComposer::new(
        &src,
        settings(Family::Pixel, 128, 64, 1),
        vec![0; 128 * 64 * 4],
        0,
    )
    .unwrap();
    while job.step(&src, 7).unwrap() == JobStatus::Pending {}
    let out = job.take_frame().unwrap().rgba;
    let expected =
        include_bytes!("../../tests/fixtures/render/backdrop/canvas-gradient-blur8.rgba");
    let differences: Vec<_> = out
        .iter()
        .zip(expected)
        .enumerate()
        .filter(|(_, (a, b))| a != b)
        .take(10)
        .collect();
    assert!(differences.is_empty(), "{differences:?}");
}

#[test]
fn backdrop_matches_canvas_blur_at_edges_and_corners() {
    use asciimorph_engine::styles::compose::FrameComposer;
    let src = source(101, 101, [255, 255, 255, 255].repeat(101 * 101));
    for work in [1, 4096] {
        let mut job = FrameComposer::new(
            &src,
            settings(Family::Pixel, 101, 101, 1),
            vec![0; 101 * 101 * 4],
            0,
        )
        .unwrap();
        while job.step(&src, work).unwrap() == JobStatus::Pending {}
        let out = job.take_frame().unwrap().rgba;
        // Chromium 156 Canvas2D: white 101-square drawImage with blur(8px),
        // onto opaque black. These include filter outsets beyond the canvas.
        for (x, edge, corner) in [
            (0, 134, 70),
            (1, 147, 84),
            (7, 213, 178),
            (8, 221, 191),
            (15, 251, 247),
            (22, 255, 255),
            (50, 255, 255),
        ] {
            assert_eq!(pixel(&out, 101, x, 50), [edge, edge, edge, 255]);
            assert_eq!(pixel(&out, 101, x, x), [corner, corner, corner, 255]);
        }
    }
}

#[test]
fn baseline_and_distinct_merged_geometry() {
    let solid = source(17, 13, [128, 128, 128, 255].repeat(17 * 13));
    let mut p = settings(Family::Pixel, 17, 13, 1);
    p.font_size = 11;
    p.contrast = 20.;
    let mut m = p.clone();
    m.family = Family::Mosaic { shape: 0 };
    assert_eq!(pixel(&render(&solid, p, 7), 17, 2, 2), [153, 153, 153, 255]);
    assert_eq!(pixel(&render(&solid, m, 7), 17, 2, 3), [128, 128, 128, 255]);
    let mut colors = Vec::new();
    for _y in 0..5 {
        for x in 0..6 {
            colors.extend(if x < 3 {
                [255, 0, 0, 255]
            } else {
                [0, 0, 255, 255]
            });
        }
    }
    let src = source(6, 5, colors);
    let square = render(&src, settings(Family::Mosaic { shape: 0 }, 6, 5, 1), 7);
    let wide = render(&src, settings(Family::Mosaic { shape: 1 }, 6, 5, 1), 7);
    assert_eq!(pixel(&square, 6, 1, 2), [255, 0, 0, 255]);
    assert_eq!(pixel(&square, 6, 4, 2), [0, 0, 255, 255]);
    assert_eq!(pixel(&wide, 6, 4, 2), [255, 0, 0, 255]);
}

#[test]
fn partial_edges_scales_and_work_budgets() {
    let mut v = Vec::new();
    for y in 0..13 {
        for x in 0..17 {
            v.extend(if x >= 15 && y >= 10 {
                [255, 0, 0, 255]
            } else {
                [0, 0, 0, 255]
            });
        }
    }
    let src = source(17, 13, v);
    for family in [
        Family::Pixel,
        Family::Mosaic { shape: 0 },
        Family::Mosaic { shape: 1 },
        Family::Mosaic { shape: 2 },
    ] {
        let a = render(&src, settings(family.clone(), 17, 13, 1), 1);
        assert_eq!(a, render(&src, settings(family.clone(), 17, 13, 1), 7));
        assert_eq!(a, render(&src, settings(family.clone(), 17, 13, 1), 4096));
        assert_eq!(pixel(&a, 17, 16, 12)[3], 255);
        let b = render(&src, settings(family, 34, 26, 2), 7);
        assert_eq!(pixel(&a, 17, 16, 12), pixel(&b, 34, 33, 25));
    }
}

#[test]
fn exact_admission_and_changed_source() {
    let src = source(1, 1, vec![0, 0, 0, 0]);
    for family in [
        Family::Pixel,
        Family::Mosaic { shape: 0 },
        Family::Mosaic { shape: 1 },
        Family::Mosaic { shape: 2 },
    ] {
        let s = settings(family, 1, 1, 1);
        for other in [0, 113] {
            let peak = StyleJob::estimated_peak_bytes(&src, &s, None, other).unwrap();
            println!("peak {peak} other {other} family {:?}", s.family);
            let exact = SourceImage::new(1, 1, vec![0; 4], peak).unwrap();
            assert!(StyleJob::new(&exact, s.clone(), None, other).is_ok());
            let short = SourceImage::new(1, 1, vec![0; 4], peak - 1).unwrap();
            assert!(matches!(
                StyleJob::new(&short, s.clone(), None, other),
                Err(RenderError::BudgetExceeded)
            ));
        }
    }
    let s = settings(Family::Pixel, 1, 1, 1);
    let mut j = StyleJob::new(&src, s, None, 0).unwrap();
    let other = source(1, 1, vec![0; 4]);
    assert!(matches!(
        j.step(&other, None, 1),
        Err(RenderError::MissingSource)
    ));
    assert_eq!(j.storage_bytes(), 0);
}

#[test]
fn hand_computed_quantization_and_control_extremes() {
    for (input, expected) in [
        (0, 0),
        (25, 0),
        (26, 51),
        (127, 102),
        (128, 153),
        (229, 204),
        (230, 255),
        (255, 255),
    ] {
        let src = source(17, 13, [input, input, input, 255].repeat(17 * 13));
        let out = render(&src, settings(Family::Pixel, 17, 13, 1), 1);
        assert_eq!(
            pixel(&out, 17, 1, 1),
            [expected, expected, expected, 255],
            "source={input}"
        );
    }
    let src = source(17, 13, [128, 128, 128, 255].repeat(17 * 13));
    for size in [3, 11, 80] {
        let mut s = settings(Family::Mosaic { shape: 0 }, 17, 13, 1);
        s.font_size = size;
        let out = render(&src, s.clone(), 7);
        assert_eq!(out, render(&src, s, 1));
        assert!(out
            .chunks_exact(4)
            .all(|p| p[0] <= 128 && p[0] == p[1] && p[1] == p[2] && p[3] == 255));
    }
    let mut s = settings(Family::Pixel, 17, 13, 1);
    s.brightness = 100.;
    assert_eq!(pixel(&render(&src, s, 7), 17, 1, 1), [255, 255, 255, 255]);
    let mut s = settings(Family::Pixel, 17, 13, 1);
    s.brightness = -100.;
    assert_eq!(pixel(&render(&src, s, 7), 17, 1, 1), [0, 0, 0, 255]);
    let mut s = settings(Family::Pixel, 17, 13, 1);
    s.invert = true;
    assert_eq!(pixel(&render(&src, s, 7), 17, 1, 1), [102, 102, 102, 255]);
    let dark = source(9, 9, [64, 64, 64, 255].repeat(81));
    let mut low = settings(Family::Mosaic { shape: 0 }, 9, 9, 1);
    low.contrast = -100.;
    let mut high = low.clone();
    high.contrast = 100.;
    assert_eq!(pixel(&render(&dark, low, 7), 9, 1, 2), [100, 100, 100, 255]);
    assert_eq!(pixel(&render(&dark, high, 7), 9, 1, 2), [0, 0, 0, 255]);
    // Canvas blur(8px) on this 17x13 constant fixture is 36 at (1,1).
    for (opacity, expected) in [(0., 36), (50., 95), (100., 153)] {
        let mut s = settings(Family::Pixel, 17, 13, 1);
        s.opacity = opacity;
        assert_eq!(
            pixel(&render(&src, s, 7), 17, 1, 1),
            [expected, expected, expected, 255]
        );
    }
}

#[test]
fn merged_partial_tiles_sample_only_the_originating_base_cell() {
    let mut wide = Vec::new();
    for _ in 0..5 {
        for x in 0..17 {
            wide.extend(if x >= 15 {
                [0, 0, 255, 255]
            } else {
                [255, 0, 0, 255]
            });
        }
    }
    let wide = render(
        &source(17, 5, wide),
        settings(Family::Mosaic { shape: 1 }, 17, 5, 1),
        7,
    );
    assert_eq!(pixel(&wide, 17, 14, 2), [255, 0, 0, 255]);
    assert_eq!(pixel(&wide, 17, 16, 2), [255, 0, 0, 255]);
    let mut tall = Vec::new();
    for y in 0..13 {
        for _ in 0..17 {
            tall.extend(if y >= 10 {
                [0, 0, 255, 255]
            } else {
                [255, 0, 0, 255]
            });
        }
    }
    let tall = render(
        &source(17, 13, tall),
        settings(Family::Mosaic { shape: 2 }, 17, 13, 1),
        7,
    );
    assert_eq!(pixel(&tall, 17, 1, 7), [255, 0, 0, 255]);
    assert_eq!(pixel(&tall, 17, 1, 12), [0, 0, 255, 255]);
}

#[test]
fn full_blur_context_alpha_and_zero_opacity() {
    let clear = source(3, 3, [255, 0, 255, 0].repeat(9));
    for family in [Family::Pixel, Family::Mosaic { shape: 2 }] {
        let out = render(&clear, settings(family.clone(), 3, 3, 1), 7);
        if matches!(family, Family::Pixel) {
            assert!(out.chunks_exact(4).all(|p| p[..3] == [0, 0, 0]));
            assert_eq!(pixel(&out, 3, 1, 1), [0, 0, 0, 255]);
        } else {
            assert!(out.chunks_exact(4).all(|p| p == [0, 0, 0, 255]));
        }
    }
    let src = source(3, 3, [128, 0, 0, 128].repeat(9));
    let out = render(&src, settings(Family::Pixel, 3, 3, 1), 1);
    assert_eq!(pixel(&out, 3, 1, 1), [153, 0, 0, 255]);
    let mut zero = settings(Family::Mosaic { shape: 0 }, 3, 3, 1);
    zero.opacity = 0.;
    let out = render(&src, zero, 7);
    // A 3-square image contributes only one red level after blur and crop.
    assert!(out.chunks_exact(4).all(|p| p == [1, 0, 0, 255]));
}

#[test]
fn rational_pitch_and_crop_rotation_keep_complete_margins() {
    let mut columns = Vec::new();
    for _ in 0..3 {
        for x in 0..9 {
            columns.extend([x as u8 * 20, 0, 0, 255]);
        }
    }
    let src = source(9, 3, columns);
    let mut s = settings(Family::Mosaic { shape: 0 }, 9, 3, 1);
    s.font_size = 3;
    let out = render(&src, s, 7);
    assert!(out
        .chunks_exact(4)
        .all(|p| p[1] == 0 && p[2] == 0 && p[3] == 255));
    assert_eq!(
        out,
        render(
            &src,
            {
                let mut s = settings(Family::Mosaic { shape: 0 }, 9, 3, 1);
                s.font_size = 3;
                s
            },
            1
        )
    );
    let mut s = settings(Family::Pixel, 3, 9, 1);
    s.font_size = 3;
    s.rotation = 90;
    let rotated = render(&src, s, 7);
    assert_eq!(rotated.len(), 3 * 9 * 4);
    assert_eq!(pixel(&rotated, 3, 2, 8)[3], 255);
    let mut s = settings(Family::Pixel, 3, 3, 1);
    s.crop = Crop {
        x: 3. / 9.,
        y: 0.,
        width: 3. / 9.,
        height: 1.,
    };
    let cropped = render(&src, s, 7);
    assert!(cropped.chunks_exact(4).all(|p| p[3] == 255));
    let skinny = source(15, 3, [10, 20, 30, 255].repeat(45));
    let mut s = settings(Family::Pixel, 15, 3, 1);
    s.font_size = 3;
    assert_eq!(render(&skinny, s, 1).len(), 15 * 3 * 4);
}

#[test]
fn transparent_hidden_rgb_does_not_tint_complete_output_and_cancel_is_one_shot() {
    let mut red_blue = Vec::new();
    let mut red_green = Vec::new();
    for _ in 0..3 {
        for x in 0..2 {
            red_blue.extend(if x == 0 {
                [255, 0, 0, 255]
            } else {
                [0, 0, 255, 0]
            });
            red_green.extend(if x == 0 {
                [255, 0, 0, 255]
            } else {
                [0, 255, 0, 0]
            });
        }
    }
    let a = source(2, 3, red_blue);
    let b = source(2, 3, red_green);
    for family in [Family::Pixel, Family::Mosaic { shape: 0 }] {
        let s = settings(family, 2, 3, 1);
        assert_eq!(render(&a, s.clone(), 7), render(&b, s.clone(), 7));
        let mut job = StyleJob::new(&a, s, None, 0).unwrap();
        assert_eq!(job.step(&a, None, 0).unwrap(), JobStatus::Pending);
        job.cancel();
        assert_eq!(job.storage_bytes(), 0);
        assert_eq!(job.step(&a, None, 1).unwrap(), JobStatus::Cancelled);
        assert!(job.take_frame().is_none());
    }
}

#[test]
fn composition_transition_has_no_full_frame_allocation_in_one_work_unit() {
    let src = source(64, 64, [128, 128, 128, 255].repeat(64 * 64));
    let mut s = settings(Family::Pixel, 64, 64, 1);
    s.font_size = 80;
    let mut job = StyleJob::new(&src, s, None, 0).unwrap();
    assert!(job.storage_bytes() >= 64 * 64 * (4 + 32));
    let mut largest = 0;
    loop {
        STEP_MAX_ALLOC.with(|v| v.set(Some(0)));
        let state = job.step(&src, None, 1).unwrap();
        largest = largest.max(STEP_MAX_ALLOC.with(|v| v.replace(None).unwrap()));
        if state == JobStatus::Complete {
            break;
        }
    }
    assert!(
        largest <= 1024,
        "largest single allocation inside step was {largest} bytes"
    );
    assert!(job.take_frame().is_some());
}
