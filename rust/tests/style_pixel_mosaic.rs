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
fn baseline_and_distinct_merged_geometry() {
    let solid = source(17, 13, [128, 128, 128, 255].repeat(17 * 13));
    let mut p = settings(Family::Pixel, 17, 13, 1);
    p.font_size = 11;
    p.contrast = 20.;
    let mut m = p.clone();
    m.family = Family::Mosaic { shape: 0 };
    assert!(render(&solid, p, 7)
        .chunks_exact(4)
        .all(|v| v == [153, 153, 153, 255]));
    assert!(render(&solid, m, 7)
        .chunks_exact(4)
        .all(|v| v == [128, 128, 128, 255]));
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
    assert_eq!(pixel(&square, 6, 0, 0), [255, 0, 0, 255]);
    assert_eq!(pixel(&square, 6, 5, 4), [0, 0, 255, 255]);
    assert!(wide.chunks_exact(4).all(|v| v == [128, 0, 128, 255]));
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
        let src = source(1, 1, vec![input, input, input, 255]);
        let out = render(&src, settings(Family::Pixel, 1, 1, 1), 1);
        assert_eq!(out, [expected, expected, expected, 255], "source={input}");
    }
    let src = source(17, 13, [128, 128, 128, 255].repeat(17 * 13));
    for size in [3, 11, 80] {
        let mut s = settings(Family::Mosaic { shape: 0 }, 17, 13, 1);
        s.font_size = size;
        assert!(render(&src, s, 7)
            .chunks_exact(4)
            .all(|p| p == [128, 128, 128, 255]));
    }
    let mut s = settings(Family::Pixel, 17, 13, 1);
    s.brightness = 100.;
    assert!(render(&src, s, 7)
        .chunks_exact(4)
        .all(|p| p == [255, 255, 255, 255]));
    let mut s = settings(Family::Pixel, 17, 13, 1);
    s.brightness = -100.;
    assert!(render(&src, s, 7)
        .chunks_exact(4)
        .all(|p| p == [0, 0, 0, 255]));
    let mut s = settings(Family::Pixel, 17, 13, 1);
    s.invert = true;
    assert!(render(&src, s, 7)
        .chunks_exact(4)
        .all(|p| p == [102, 102, 102, 255]));
    let dark = source(1, 1, vec![64, 64, 64, 255]);
    let mut low = settings(Family::Mosaic { shape: 0 }, 1, 1, 1);
    low.contrast = -100.;
    let mut high = low.clone();
    high.contrast = 100.;
    assert_eq!(render(&dark, low, 7), [100, 100, 100, 255]);
    assert_eq!(render(&dark, high, 7), [0, 0, 0, 255]);
    for (opacity, expected) in [(0., 128), (50., 141), (100., 153)] {
        let mut s = settings(Family::Pixel, 17, 13, 1);
        s.opacity = opacity;
        assert!(render(&src, s, 7)
            .chunks_exact(4)
            .all(|p| p == [expected, expected, expected, 255]));
    }
}

#[test]
fn merged_partial_tiles_use_entire_clipped_area() {
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
    assert_eq!(pixel(&wide, 17, 12, 0), [153, 0, 102, 255]);
    assert_eq!(pixel(&wide, 17, 16, 4), [153, 0, 102, 255]);
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
    assert_eq!(pixel(&tall, 17, 0, 9), [255, 0, 0, 255]);
    assert_eq!(pixel(&tall, 17, 16, 12), [0, 0, 255, 255]);
}

#[test]
fn full_blur_context_alpha_and_zero_opacity() {
    let clear = source(3, 3, [255, 0, 255, 0].repeat(9));
    for family in [Family::Pixel, Family::Mosaic { shape: 2 }] {
        let out = render(&clear, settings(family, 3, 3, 1), 7);
        assert!(out.iter().all(|b| *b == 0));
    }
    let src = source(3, 3, [128, 0, 0, 128].repeat(9));
    let out = render(&src, settings(Family::Pixel, 3, 3, 1), 1);
    assert!(out.chunks_exact(4).all(|p| p == [145, 0, 0, 192]));
    let mut zero = settings(Family::Mosaic { shape: 0 }, 3, 3, 1);
    zero.opacity = 0.;
    let out = render(&src, zero, 7);
    assert!(out.chunks_exact(4).all(|p| p == [128, 0, 0, 128]));
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
    assert_eq!(pixel(&out, 9, 0, 0), pixel(&out, 9, 1, 0));
    assert_eq!(pixel(&out, 9, 2, 0), pixel(&out, 9, 3, 0));
    assert_eq!(pixel(&out, 9, 5, 0), pixel(&out, 9, 6, 0));
    assert_ne!(pixel(&out, 9, 1, 0), pixel(&out, 9, 2, 0));
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
