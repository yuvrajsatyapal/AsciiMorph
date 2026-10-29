use asciimorph_engine::{
    abi,
    character::RenderError,
    session::RenderSession,
    styles::{
        contract::{Family, StyleSettings},
        wire::encode_style_settings,
    },
};
fn settings() -> StyleSettings {
    StyleSettings {
        family: Family::Pixel,
        width: 1,
        height: 1,
        scale: 1,
        rotation: 0,
        seed: 0,
        time_us: 0.,
        crop: asciimorph_engine::character::Crop {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        },
        atlas_count: 0,
        atlas_origin_x: 0.,
        atlas_origin_y: 0.,
        space_index: 65535,
        font_size: 11,
        brightness: 0.,
        contrast: 20.,
        invert: false,
        opacity: 100.,
    }
}
#[test]
fn style_discovery_is_additive_without_advertising_unimplemented_families() {
    assert_eq!(abi::render_style_profile_version(), 1);
    for dispatch in 0..=16 {
        assert_eq!(
            abi::render_style_supported(dispatch),
            u32::from(matches!(dispatch, 4 | 10 | 11 | 15))
        );
    }
    assert_eq!(abi::render_style_supported(u32::MAX), 0);
    assert_eq!(abi::render_abi_version(), 1);
    assert_eq!(abi::render_characters_profile_version(), 1);
    assert_eq!(abi::render_characters_context_version(), 1);
    assert_eq!(abi::render_characters_atlas_retention_version(), 1);
}
#[test]
fn native_style_begin_rejects_invalid_or_disposed_handles_without_reading_pointers() {
    assert_eq!(abi::render_begin_style_v1(0, u32::MAX, 144), 0);
    let h = abi::render_create(10000);
    assert_ne!(h, 0);
    assert_eq!(abi::render_begin_style_v1(h, u32::MAX, 144), 0);
    assert_eq!(abi::render_error(h), 1);
    assert_eq!(abi::render_drop(h), 1);
    assert_eq!(abi::render_begin_style_v1(h, 0, 144), 0);
    assert_eq!(abi::render_error(h), 7);
}
#[test]
fn exact_stage_ownership_and_real_pixel_frame_release_without_retained_allocations() {
    let mut s = RenderSession::new(10000).unwrap();
    let mut source = Vec::new();
    for v in [1u32, 1, 1, 1, 0, 0, 0, 0] {
        source.extend(v.to_le_bytes());
    }
    source.extend([1, 2, 3, 255]);
    let ptr = s.stage(source.len()).unwrap();
    s.stage_mut(ptr).unwrap().copy_from_slice(&source);
    s.upload(1, ptr, source.len()).unwrap();
    s.unstage(ptr).unwrap();
    let bytes = encode_style_settings(&settings()).unwrap();
    assert_eq!(
        s.begin_style_staged(usize::MAX, bytes.len()),
        Err(RenderError::InvalidInput)
    );
    let p = s.stage(bytes.len()).unwrap();
    s.stage_mut(p).unwrap().copy_from_slice(&bytes);
    let before = s.storage_bytes();
    assert_eq!(
        s.begin_style_staged(p + 1, bytes.len() - 1),
        Err(RenderError::InvalidInput)
    );
    assert_eq!(
        s.begin_style_staged(p, bytes.len() + 1),
        Err(RenderError::InvalidInput)
    );
    let id = s.begin_style_staged(p, bytes.len()).unwrap();
    while s.step(id, 7).unwrap() != asciimorph_engine::character::JobStatus::Complete {}
    let frame = s.frame_output(id).unwrap();
    assert_eq!(
        &frame[..16],
        &[1u32, 1, 1, 4]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect::<Vec<_>>()
    );
    // Quarter coverage at the half-pixel inset over the original [1, 2, 3] backdrop.
    assert_eq!(&frame[16..], [1, 1, 2, 255]);
    s.release(id).unwrap();
    assert_eq!(s.storage_bytes(), before);
    s.unstage(p).unwrap();
    assert_eq!(
        s.begin_style_staged(p, bytes.len()),
        Err(RenderError::InvalidInput)
    );
    assert_eq!(s.storage_bytes(), 4);
}
