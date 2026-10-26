use super::*;
use crate::styles::{
    contract::{Family, StyleSettings},
    wire::encode_style_settings,
    StyleJob,
};
fn source() -> SourceImage {
    let mut rgba = Vec::with_capacity(35);
    rgba.extend(0u8..24);
    SourceImage::new(3, 2, rgba, 1_000_000).unwrap()
}
fn session() -> RenderSession {
    let mut s = RenderSession::new(1_000_000).unwrap();
    s.source = Some(source());
    s
}
fn settings(glyph: bool) -> StyleSettings {
    StyleSettings {
        family: if glyph {
            Family::Braille { threshold: 50. }
        } else {
            Family::Pixel
        },
        width: 3,
        height: 2,
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
        atlas_count: if glyph { 256 } else { 0 },
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
fn begin(s: &mut RenderSession, cfg: StyleSettings) -> Result<u32, RenderError> {
    let b = encode_style_settings(&cfg)?;
    let p = s.stage(b.len())?;
    s.stage_mut(p)?.copy_from_slice(&b);
    let result = s.begin_style_with(p, b.len(), StyleJob::fixture_peak, StyleJob::fixture_new);
    s.unstage(p)?;
    result
}
fn calibration(value: u8) -> Arc<GlyphCalibration> {
    let mut masks = Vec::with_capacity(300);
    masks.resize(256, value);
    masks[0] = 0;
    Arc::new(GlyphCalibration::new(256, 1, 1, masks, vec![0.; 256], vec![0.; 2304]).unwrap())
}
fn finish(s: &mut RenderSession, id: u32) -> Vec<u8> {
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
    s.frame_output(id).unwrap().to_vec()
}
fn source_upload(s: &mut RenderSession, value: u8) -> Result<(), RenderError> {
    let mut b = Vec::new();
    for v in [1u32, 1, 3, 2, 0, 0, 0, 0] {
        b.extend(v.to_le_bytes());
    }
    b.extend([value; 24]);
    let p = s.stage(b.len())?;
    s.stage_mut(p)?.copy_from_slice(&b);
    let r = s.upload(1, p, b.len());
    s.unstage(p)?;
    r
}
#[test]
fn style_fixture_is_cooperative_and_retains_full_frame_until_release() {
    let mut s = session();
    let original = s.source().unwrap().rgba().as_ptr();
    let base = s.storage_bytes();
    let a = begin(&mut s, settings(false)).unwrap();
    let b = begin(&mut s, settings(false)).unwrap();
    assert!(begin(&mut s, settings(false)).is_err());
    assert!(s.release(a).is_err());
    assert!(s.frame_output(a).is_err());
    assert_eq!(s.step(a, 0).unwrap(), JobStatus::Pending);
    assert_eq!(s.step(a, 1).unwrap(), JobStatus::Pending);
    let out = finish(&mut s, a);
    assert_eq!(
        &out[..16],
        &[1u32, 3, 2, 24]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect::<Vec<_>>()
    );
    assert_eq!(&out[16..], &(0u8..24).collect::<Vec<_>>());
    assert!(s.output(a).is_err());
    assert_eq!(s.source().unwrap().rgba().as_ptr(), original);
    assert!(begin(&mut s, settings(false)).is_err());
    assert_eq!(s.step(a, 1).unwrap(), JobStatus::Complete);
    s.release(a).unwrap();
    assert!(s.release(a).is_err());
    assert!(s.frame_output(a).is_err());
    s.cancel(b).unwrap();
    assert!(s.cancel(b).is_err());
    assert!(s.step(b, 1).is_err());
    assert_eq!(s.storage_bytes(), base);
}
#[test]
fn finished_profile_thumbnail_is_cooperative_and_preserves_full_output_until_success() {
    let mut s = session();
    let id = begin(&mut s, settings(false)).unwrap();
    let original = finish(&mut s, id);
    s.frame_thumbnail(id, 2).unwrap();
    assert_eq!(s.frame_output(id).unwrap(), original);
    assert_eq!(s.step(id, 0).unwrap(), JobStatus::Pending);
    assert_eq!(s.step(id, 1).unwrap(), JobStatus::Pending);
    assert_eq!(s.frame_output(id).unwrap(), original);
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
    let thumbnail = s.frame_output(id).unwrap();
    assert_eq!(
        &thumbnail[..16],
        &[1u32, 2, 1, 8]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect::<Vec<_>>()
    );
    assert_eq!(thumbnail.len(), 24);
}
#[test]
fn thumbnail_rejects_incomplete_legacy_released_and_invalid_size() {
    let mut s = session();
    let id = begin(&mut s, settings(false)).unwrap();
    assert_eq!(s.frame_thumbnail(id, 2), Err(RenderError::InvalidInput));
    finish(&mut s, id);
    for max_side in [0, 193, u32::MAX] {
        assert_eq!(
            s.frame_thumbnail(id, max_side),
            Err(RenderError::InvalidInput)
        );
    }
    s.release(id).unwrap();
    assert_eq!(s.frame_thumbnail(id, 2), Err(RenderError::InvalidInput));
}
fn synthetic_profile(
    s: &mut RenderSession,
    width: u32,
    height: u32,
    pixels: &[u8],
    characters: bool,
) -> u32 {
    let offset = if characters { 32 } else { 16 };
    let mut output = vec![0; offset + pixels.len()];
    output[0..4].copy_from_slice(&1u32.to_le_bytes());
    output[4..8].copy_from_slice(&width.to_le_bytes());
    output[8..12].copy_from_slice(&height.to_le_bytes());
    output[offset..].copy_from_slice(pixels);
    let id = s.next_job;
    s.next_job += 1;
    s.jobs.insert(
        id,
        RetainedJob {
            numeric: None,
            is_profile: true,
            frame_columns: 0,
            frame_rows: 0,
            output_bytes: output.len(),
            reserved_bytes: output.capacity(),
            output,
            uses_calibration: false,
            thumbnail: None,
            is_thumbnail: false,
            frame_rgba_offset: offset,
        },
    );
    id
}
fn rgba(s: &RenderSession, id: u32) -> &[u8] {
    &s.frame_output(id).unwrap()[16..]
}
#[test]
fn thumbnail_area_average_ignores_transparent_colors_and_handles_nondivisible_extents() {
    let mut s = RenderSession::new(1_000_000).unwrap();
    let pixels = [
        255, 0, 0, 0, 20, 80, 140, 255, 20, 80, 140, 255, 20, 80, 140, 255, 20, 80, 140, 255, 0,
        255, 0, 0,
    ];
    let id = synthetic_profile(&mut s, 3, 2, &pixels, false);
    s.frame_thumbnail(id, 1).unwrap();
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
    assert_eq!(rgba(&s, id), &[20, 80, 140, 170]);
    let transparent = [255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 200, 30, 40, 0];
    let id = synthetic_profile(&mut s, 2, 2, &transparent, true);
    s.frame_thumbnail(id, 1).unwrap();
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
    assert_eq!(rgba(&s, id), &[0, 0, 0, 0]);
}
#[test]
fn thumbnail_splits_multicolor_source_pixels_across_fractional_bins() {
    let mut s = RenderSession::new(1_000_000).unwrap();
    let id = synthetic_profile(
        &mut s,
        3,
        1,
        &[255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
        false,
    );
    s.frame_thumbnail(id, 2).unwrap();
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
    assert_eq!(rgba(&s, id), &[170, 85, 0, 255, 0, 85, 170, 255]);
}
#[test]
fn thumbnail_no_upscale_and_exact_budget_accounting() {
    let mut s = RenderSession::new(1_000_000).unwrap();
    let id = synthetic_profile(&mut s, 2, 1, &[7, 8, 9, 255, 7, 8, 9, 255], true);
    let base = s.storage_bytes();
    let peak = base + 2 * std::mem::size_of::<[f64; 4]>() + 16 + 8;
    s.budget = peak - 1;
    assert_eq!(s.frame_thumbnail(id, 192), Err(RenderError::BudgetExceeded));
    assert_eq!(s.storage_bytes(), base);
    assert_eq!(s.frame_output(id).unwrap().len(), 40);
    s.budget = peak;
    s.frame_thumbnail(id, 192).unwrap();
    assert_eq!(s.storage_bytes(), peak);
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
    assert_eq!(rgba(&s, id), &[7, 8, 9, 255, 7, 8, 9, 255]);
    assert_eq!(s.storage_bytes(), 24);
    s.release(id).unwrap();
    assert_eq!(s.storage_bytes(), 0);
}
#[test]
fn thousand_square_thumbnail_has_measured_peak_and_bounded_source_work() {
    let mut s = RenderSession::new(20_000_000).unwrap();
    let pixels = vec![25u8; 1000 * 1000 * 4];
    let id = synthetic_profile(&mut s, 1000, 1000, &pixels, false);
    let base = s.storage_bytes();
    let expected_peak = base + 192 * 192 * std::mem::size_of::<[f64; 4]>() + 16 + 192 * 192 * 4;
    s.budget = expected_peak - 1;
    assert_eq!(s.frame_thumbnail(id, 192), Err(RenderError::BudgetExceeded));
    s.budget = expected_peak;
    s.frame_thumbnail(id, 192).unwrap();
    assert_eq!(s.storage_bytes(), expected_peak);
    let mut previous = 0;
    for _ in 0..100 {
        assert_eq!(s.step(id, 1).unwrap(), JobStatus::Pending);
        let current = s.jobs.get(&id).unwrap().thumbnail.as_ref().unwrap().cursor;
        assert!(current - previous <= 1);
        previous = current;
    }
    while s.step(id, 4096).unwrap() != JobStatus::Complete {}
    assert_eq!(rgba(&s, id)[0..4], [25, 25, 25, 25]);
    assert!(s.storage_bytes() < expected_peak);
}
#[test]
fn thumbnail_cancel_and_source_replacement_release_all_conversion_storage() {
    let mut s = session();
    let baseline = s.storage_bytes();
    let id = begin(&mut s, settings(false)).unwrap();
    finish(&mut s, id);
    s.frame_thumbnail(id, 1).unwrap();
    assert_eq!(s.step(id, 1).unwrap(), JobStatus::Pending);
    s.cancel(id).unwrap();
    assert_eq!(s.storage_bytes(), baseline);
    assert!(s.frame_output(id).is_err());
    let id = begin(&mut s, settings(false)).unwrap();
    finish(&mut s, id);
    s.frame_thumbnail(id, 1).unwrap();
    source_upload(&mut s, 200).unwrap();
    assert_eq!(s.storage_bytes(), s.source().unwrap().storage_bytes());
    assert!(s.step(id, 1).is_err());
}
#[test]
fn style_future_peak_accepts_exact_budget_and_rejects_one_byte_short() {
    let mut s = session();
    let cfg = settings(false);
    let bytes = encode_style_settings(&cfg).unwrap();
    let peak = StyleJob::fixture_peak(s.source().unwrap(), &cfg, None, bytes.len()).unwrap();
    s.budget = peak - 1;
    let before = s.storage_bytes();
    assert_eq!(begin(&mut s, cfg.clone()), Err(RenderError::BudgetExceeded));
    assert_eq!(s.storage_bytes(), before);
    assert!(s.jobs.is_empty());
    s.budget = peak;
    let id = begin(&mut s, cfg).unwrap();
    assert!(s.admission_bytes() <= peak);
    assert!(s.stage(peak - s.storage_bytes()).is_err());
    assert_eq!(finish(&mut s, id).len(), 40);
    assert!(s.storage_bytes() <= peak);
    s.release(id).unwrap();
    assert_eq!(s.storage_bytes(), before);
}
#[test]
fn style_source_replacement_cancels_pending_and_completed_but_failed_upload_preserves_them() {
    let mut s = session();
    let a = begin(&mut s, settings(false)).unwrap();
    let b = begin(&mut s, settings(false)).unwrap();
    let expected = finish(&mut s, a);
    let old_budget = s.budget;
    s.budget = s.admission_bytes() + 56;
    assert_eq!(source_upload(&mut s, 200), Err(RenderError::BudgetExceeded));
    assert_eq!(s.frame_output(a).unwrap(), expected);
    assert_eq!(s.step(b, 1).unwrap(), JobStatus::Pending);
    s.budget = old_budget;
    source_upload(&mut s, 200).unwrap();
    assert!(s.frame_output(a).is_err());
    assert!(s.step(b, 1).is_err());
    assert!(s.jobs.is_empty());
}
#[test]
fn style_admission_rechecks_source_geometry_and_captured_braille_resources() {
    let mut s = session();
    let base = s.storage_bytes();
    let mut cfg = settings(false);
    cfg.width = 4;
    assert_eq!(begin(&mut s, cfg), Err(RenderError::InvalidInput));
    assert_eq!(s.storage_bytes(), base);
    assert_eq!(
        begin(&mut s, settings(true)),
        Err(RenderError::MissingCalibration)
    );
    s.calibration = Some(calibration(128));
    let mut cfg = settings(true);
    cfg.atlas_origin_x = 1.01;
    assert_eq!(begin(&mut s, cfg), Err(RenderError::InvalidInput));
    let mut bad = calibration(128).as_ref().clone();
    Arc::make_mut(&mut bad.masks)[0] = 1;
    s.calibration = Some(Arc::new(bad));
    assert!(begin(&mut s, settings(true)).is_err());
    s.calibration = Some(calibration(0));
    assert!(begin(&mut s, settings(true)).is_err());
    s.calibration = Some(Arc::new(
        GlyphCalibration::new(2, 1, 1, vec![0, 255], vec![0., 1.], vec![0.; 18]).unwrap(),
    ));
    assert_eq!(
        begin(&mut s, settings(true)),
        Err(RenderError::MissingCalibration)
    );
    assert!(s.jobs.is_empty());
}
#[test]
fn style_captures_deduplicate_masks_and_survive_actual_atlas_upload_then_drop() {
    let mut s = session();
    let a = calibration(128);
    let weak = Arc::downgrade(&a);
    s.calibration = Some(Arc::clone(&a));
    let base = s.calibration_bytes();
    let first = begin(&mut s, settings(true)).unwrap();
    let second = begin(&mut s, settings(true)).unwrap();
    assert_eq!(s.calibration_bytes(), base);
    drop(a);
    let mut b = Vec::new();
    for v in [1u32, 2, 0, 0, 256, 1, 1, 0] {
        b.extend(v.to_le_bytes());
    }
    b.extend([0u8; 256]);
    for _ in 0..2560 {
        b.extend(0f32.to_le_bytes());
    }
    let p = s.stage(b.len()).unwrap();
    s.stage_mut(p).unwrap().copy_from_slice(&b);
    s.upload(2, p, b.len()).unwrap();
    s.unstage(p).unwrap();
    assert!(weak.upgrade().is_some());
    assert!(s.calibration_bytes() > base);
    assert_eq!(finish(&mut s, first)[16..], (0u8..24).collect::<Vec<_>>());
    s.release(first).unwrap();
    assert!(weak.upgrade().is_some());
    s.cancel(second).unwrap();
    assert!(weak.upgrade().is_none());
    s.calibration = Some(calibration(64));
    let current = Arc::downgrade(s.calibration.as_ref().unwrap());
    let pending = begin(&mut s, settings(true)).unwrap();
    assert_eq!(s.step(pending, 1).unwrap(), JobStatus::Pending);
    s.calibration = Some(calibration(255));
    assert!(current.upgrade().is_some());
    drop(s);
    assert!(current.upgrade().is_none());
}
#[test]
fn style_and_characters_captures_share_one_mask_allocation_and_protect_each_future_peak() {
    let mut s = session();
    let c = calibration(128);
    s.calibration = Some(Arc::clone(&c));
    let base = s.calibration_bytes();
    let first = begin(&mut s, settings(true)).unwrap();
    let mut cfg = Vec::new();
    for v in [1u32, 3, 2, 0, 256, 0, 0, 65535] {
        cfg.extend(v.to_le_bytes());
    }
    for v in [11f64, 1., 0., 0., 0., 0., 1., 1., 0., 0.] {
        cfg.extend(v.to_le_bytes());
    }
    let p = s.stage(cfg.len()).unwrap();
    s.stage_mut(p).unwrap().copy_from_slice(&cfg);
    let second = s.begin_characters_staged(p, cfg.len()).unwrap();
    s.unstage(p).unwrap();
    assert_eq!(s.calibration_bytes(), base);
    let free = s.budget - s.storage_bytes();
    assert_eq!(s.stage(free), Err(RenderError::BudgetExceeded));
    let clone = Arc::new(c.as_ref().clone());
    let extra = clone.coverage.capacity() * 4
        + clone.shapes.capacity() * 4
        + std::mem::size_of::<GlyphCalibration>()
        + 2 * std::mem::size_of::<usize>();
    s.calibration = Some(clone);
    assert_eq!(s.calibration_bytes(), base + extra);
    s.cancel(first).unwrap();
    s.cancel(second).unwrap();
}
