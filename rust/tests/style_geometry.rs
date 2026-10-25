use asciimorph_engine::character::{Crop, JobStatus, RenderError, MAX_SOURCE_BYTES};
use asciimorph_engine::source::SourceImage;
use asciimorph_engine::styles::{
    compose::FrameComposer,
    contract::{Family, StyleSettings},
    geometry::FrameGeometry,
    sampling::AreaSampler,
};

fn settings(width: u32, height: u32, scale: u32, rotation: u32, crop: Crop) -> StyleSettings {
    StyleSettings {
        family: Family::Pixel,
        width,
        height,
        scale,
        rotation,
        seed: 0,
        time_us: 0.,
        crop,
        atlas_count: 0,
        atlas_origin_x: 0.,
        atlas_origin_y: 0.,
        space_index: 65535,
        font_size: 3,
        brightness: 0.,
        contrast: 0.,
        invert: false,
        opacity: 100.,
    }
}
fn source(w: u32, h: u32, p: [u8; 4], budget: usize) -> SourceImage {
    SourceImage::new(w, h, p.to_vec().repeat((w * h) as usize), budget).unwrap()
}
fn full() -> Crop {
    Crop {
        x: 0.,
        y: 0.,
        width: 1.,
        height: 1.,
    }
}

#[test]
fn geometry_crop_rotation_and_export_scale() {
    let src = source(17, 13, [2, 3, 4, 255], MAX_SOURCE_BYTES);
    let g = FrameGeometry::new(&src, &settings(17, 13, 1, 0, full())).unwrap();
    assert_eq!(g.extent(), (17, 13));
    let g2 = FrameGeometry::new(&src, &settings(34, 26, 2, 0, full())).unwrap();
    assert_eq!(g2.extent(), g.extent());
    assert_eq!(g2.frame_extent(), (34, 26));
    let c = Crop {
        x: 1. / 17.,
        y: 2. / 13.,
        width: 10. / 17.,
        height: 8. / 13.,
    };
    let g = FrameGeometry::new(&src, &settings(8, 10, 1, 90, c)).unwrap();
    assert_eq!(g.extent(), (8, 10));
    assert_eq!(g.pixel(&src, 90, 0, 0), [2, 3, 4, 255]);
    assert!(matches!(
        FrameGeometry::new(&src, &settings(7, 10, 1, 90, c)),
        Err(RenderError::InvalidInput)
    ));
}

#[test]
fn area_sampler_keeps_fractional_ties_and_ignores_hidden_rgb() {
    let src =
        SourceImage::new(2, 1, vec![255, 0, 0, 255, 0, 255, 255, 0], MAX_SOURCE_BYTES).unwrap();
    let g = FrameGeometry::new(&src, &settings(2, 1, 1, 0, full())).unwrap();
    let mut s = AreaSampler::new(0., 0., 2., 1.).unwrap();
    assert_eq!(s.step(&src, &g, 0, 1).unwrap(), JobStatus::Pending);
    assert_eq!(s.step(&src, &g, 0, 1).unwrap(), JobStatus::Complete);
    let v = s.sample();
    assert_eq!(v.rgb, [255., 0., 0.]);
    assert_eq!(v.alpha, 127.5);
    let mut outside = AreaSampler::new(-1., 0., 1., 1.).unwrap();
    outside.step(&src, &g, 0, 10).unwrap();
    assert_eq!(outside.sample().alpha, 255.);
}

#[test]
fn compositor_is_bounded_one_shot_and_budgeted() {
    let src = source(1, 1, [255, 0, 0, 0], MAX_SOURCE_BYTES);
    let s = settings(1, 1, 1, 0, full());
    let layer = vec![0, 0, 255, 255];
    let peak = FrameComposer::estimated_peak_bytes(&src, &s, layer.capacity(), 0).unwrap();
    println!(
        "tiny peak={peak} source={} metadata={} layer={} scratch={} serialization={}",
        src.storage_bytes(),
        std::mem::size_of::<SourceImage>() + std::mem::size_of::<FrameComposer>(),
        layer.capacity(),
        32,
        4
    );
    let mut j = FrameComposer::new(&src, s.clone(), layer, 0).unwrap();
    assert_eq!(j.step(&src, 0).unwrap(), JobStatus::Pending);
    assert_eq!(j.step(&src, 1).unwrap(), JobStatus::Pending);
    while j.step(&src, 1).unwrap() == JobStatus::Pending {}
    let f = j.take_frame().unwrap();
    assert_eq!(f.rgba, [0, 0, 255, 255]);
    assert!(j.take_frame().is_none());
    let exact = source(1, 1, [0; 4], peak);
    assert!(FrameComposer::new(&exact, s.clone(), vec![0; 4], 0).is_ok());
    let tight = source(1, 1, [0; 4], peak - 1);
    assert!(matches!(
        FrameComposer::new(&tight, s, vec![0; 4], 0),
        Err(RenderError::BudgetExceeded)
    ));
    j.cancel();
    assert_eq!(j.storage_bytes(), 0);
}

#[test]
fn scaled_frame_initializes_every_pixel_and_rejects_changed_source() {
    let mut pixels = [0, 255, 0, 0].repeat(17 * 13);
    let mid = (6 * 17 + 8) * 4;
    pixels[mid..mid + 4].copy_from_slice(&[255, 0, 0, 255]);
    let src = SourceImage::new(17, 13, pixels, MAX_SOURCE_BYTES).unwrap();
    for scale in [1, 2] {
        let s = settings(17 * scale, 13 * scale, scale, 0, full());
        let mut j = FrameComposer::new(
            &src,
            s,
            vec![0; 17 * 13 * scale as usize * scale as usize * 4],
            0,
        )
        .unwrap();
        while j.step(&src, 17).unwrap() == JobStatus::Pending {}
        let f = j.take_frame().unwrap();
        assert_eq!(f.rgba.len(), (f.width * f.height * 4) as usize);
        assert!(f
            .rgba
            .chunks_exact(4)
            .all(|p| p == [0, 0, 0, 0] || p[3] > 0));
        assert!(f.rgba.chunks_exact(4).any(|p| p[0] > 0));
    }
    let mut j = FrameComposer::new(
        &src,
        settings(17, 13, 1, 0, full()),
        vec![0; 17 * 13 * 4],
        0,
    )
    .unwrap();
    let other = SourceImage::new(17, 13, src.rgba().to_vec(), MAX_SOURCE_BYTES).unwrap();
    assert!(matches!(j.step(&other, 1), Err(RenderError::MissingSource)));
    assert_eq!(j.storage_bytes(), 0);
    assert_eq!(j.status(), JobStatus::Cancelled);
}

#[test]
fn area_sampler_partial_rectangle_and_opaque_field() {
    let src = source(17, 13, [10, 20, 30, 255], MAX_SOURCE_BYTES);
    let g = FrameGeometry::new(&src, &settings(17, 13, 1, 0, full())).unwrap();
    let mut s = AreaSampler::new(16.25, 12.5, 19., 15.).unwrap();
    assert_eq!(s.step(&src, &g, 0, 0).unwrap(), JobStatus::Pending);
    assert_eq!(s.step(&src, &g, 0, 1).unwrap(), JobStatus::Complete);
    assert_eq!(s.sample().rgb, [10., 20., 30.]);
    assert_eq!(s.sample().alpha, 255.);
    let clear = source(17, 13, [255, 200, 100, 0], MAX_SOURCE_BYTES);
    let mut s = AreaSampler::new(0., 0., 17., 13.).unwrap();
    while s.step(&clear, &g, 0, 7).unwrap() == JobStatus::Pending {}
    assert_eq!(s.sample().rgb, [0.; 3]);
    assert_eq!(s.sample().alpha, 0.);
}

#[test]
fn calculated_and_native_capacity_peak_for_million_pixels() {
    let src = source(1000, 1000, [1, 2, 3, 255], MAX_SOURCE_BYTES);
    let settings = settings(1000, 1000, 1, 0, full());
    let layer = vec![0; 4_000_000];
    let peak = FrameComposer::estimated_peak_bytes(&src, &settings, layer.capacity(), 0).unwrap();
    let j = FrameComposer::new(&src, settings, layer, 0).unwrap();
    let live = src.storage_bytes()
        + std::mem::size_of::<SourceImage>()
        + std::mem::size_of::<FrameComposer>()
        + j.storage_bytes();
    assert_eq!(peak - live, 4_000_000);
    println!(
        "million-pixel peak={peak} native-live={live} source={} composer-storage={} metadata={}",
        src.storage_bytes(),
        j.storage_bytes(),
        std::mem::size_of::<SourceImage>() + std::mem::size_of::<FrameComposer>()
    );
}

#[test]
fn opaque_constant_source_fills_margins_of_tiny_frame() {
    let src = source(1, 1, [12, 34, 56, 255], MAX_SOURCE_BYTES);
    let mut j = FrameComposer::new(&src, settings(1, 1, 1, 0, full()), vec![0; 4], 0).unwrap();
    while j.step(&src, 1).unwrap() == JobStatus::Pending {}
    assert_eq!(j.take_frame().unwrap().rgba, [12, 34, 56, 255]);
}
