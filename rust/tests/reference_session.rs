use asciimorph_engine::{
    character::{CharacterSettings, JobStatus, Mapping, RenderError},
    session::{decode_reference_settings, RenderSession},
};
fn upload(s: &mut RenderSession, kind: u32, b: &[u8]) -> Result<(), RenderError> {
    let p = s.stage(b.len())?;
    s.stage_mut(p)?.copy_from_slice(b);
    let result = s.upload(kind, p, b.len());
    s.unstage(p)?;
    result
}
fn src(w: u32, h: u32) -> Vec<u8> {
    let mut b = Vec::new();
    for v in [1u32, 1, w, h, 0, 0, 0, 0] {
        b.extend(v.to_le_bytes());
    }
    for y in 0..h {
        for x in 0..w {
            let v = if x < 2 { 0 } else { 255 };
            b.extend([v, v, v, if y == 0 { 128 } else { 255 }]);
        }
    }
    b
}
fn atlas(count: u32, w: u32, h: u32) -> Vec<u8> {
    let mut b = Vec::new();
    for v in [1u32, 2, 0, 0, count, w, h, 0] {
        b.extend(v.to_le_bytes());
    }
    b.extend(vec![0; (count * w * h) as usize]);
    while b.len() % 4 != 0 {
        b.push(0);
    }
    for _ in 0..count * 10 {
        b.extend(0f32.to_le_bytes());
    }
    b
}
fn cfg(w: u32, h: u32, space: u32) -> Vec<u8> {
    let mut b = Vec::new();
    for v in [1, w, h, 0, 2, 0, 0, space] {
        b.extend(v.to_le_bytes());
    }
    for v in [3f64, 1., 0., 0., 0., 0., 1., 1., 0., 0.] {
        b.extend(v.to_le_bytes());
    }
    b
}
fn begin(s: &mut RenderSession, b: &[u8]) -> Result<u32, RenderError> {
    let p = s.stage(b.len())?;
    s.stage_mut(p)?.copy_from_slice(b);
    let r = s.begin_characters_staged(p, b.len());
    s.unstage(p)?;
    r
}
fn finish(s: &mut RenderSession, id: u32) -> Vec<u8> {
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
    s.frame_output(id).unwrap().to_vec()
}
fn u(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes(b[i..i + 4].try_into().unwrap())
}
#[test]
fn independent_112_byte_contract_and_rejections() {
    let b = cfg(5, 3, 65535);
    assert_eq!(b.len(), 112);
    let (s, count, x, y, space) = decode_reference_settings(&b).unwrap();
    assert_eq!(
        (s.frame_width, s.frame_height, count, x, y, space),
        (5, 3, 2, 0., 0., 65535)
    );
    for (offset, value) in [
        (0, 2u32),
        (12, 65536),
        (16, 1),
        (16, 257),
        (20, 3),
        (24, 1),
        (28, 2),
        (28, 256),
        (28, 65534),
        (28, 65536),
    ] {
        let mut bad = b.clone();
        bad[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        assert!(
            decode_reference_settings(&bad).is_err(),
            "offset {offset} value {value}"
        );
    }
    for offset in (32..112).step_by(8) {
        let mut bad = b.clone();
        bad[offset..offset + 8].copy_from_slice(&f64::NAN.to_le_bytes());
        assert!(decode_reference_settings(&bad).is_err());
    }
    for len in [0, 32, 111, 113, 160] {
        assert!(decode_reference_settings(&vec![0; len]).is_err());
    }
}
#[test]
fn exact_native_frame_space_vs_empty_dot_and_kind_separation() {
    let mut s = RenderSession::new(100000).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    for (space, index) in [(0, 65535u16), (1, 0), (65535, 0)] {
        let id = begin(&mut s, &cfg(5, 3, space)).unwrap();
        let out = finish(&mut s, id);
        assert!(s.output(id).is_err());
        assert_eq!(
            (
                u(&out, 0),
                u(&out, 4),
                u(&out, 8),
                u(&out, 12),
                u(&out, 16),
                u(&out, 20),
                u(&out, 24),
                u(&out, 28)
            ),
            (1, 5, 3, 2, 1, 32, 92, 152)
        );
        assert!(out[32..92].iter().all(|b| *b == 0));
        assert_eq!(u16::from_le_bytes(out[124..126].try_into().unwrap()), 65535);
        assert_eq!(u16::from_le_bytes(out[126..128].try_into().unwrap()), index);
        assert_eq!(
            f32::from_le_bytes(out[148..152].try_into().unwrap()),
            if index == 65535 { 0. } else { 1. }
        );
        s.release(id).unwrap();
    }
    let mut old = CharacterSettings::new(1, 1).unwrap();
    old.mapping = Mapping::Braille;
    let id = s.begin(old).unwrap();
    while s.step(id, 4096).unwrap() != JobStatus::Complete {}
    assert!(s.frame_output(id).is_err());
    assert_eq!(s.output(id).unwrap().len(), 48);
    s.release(id).unwrap();
}
#[test]
fn nullable_grid_and_actual_extents_origin_source_geometry() {
    let mut s = RenderSession::new(100000).unwrap();
    upload(&mut s, 1, &src(1, 1)).unwrap();
    upload(&mut s, 2, &atlas(2, 3, 2)).unwrap();
    let id = begin(&mut s, &cfg(1, 1, 65535)).unwrap();
    let out = finish(&mut s, id);
    assert_eq!(out.len(), 36);
    assert_eq!((u(&out, 12), u(&out, 16), u(&out, 24)), (0, 0, 0));
    assert_eq!(&out[32..], &[0; 4]);
    s.release(id).unwrap();
    for (offset, v) in [(96, 3.1f64), (104, -2.1)] {
        let mut b = cfg(1, 1, 65535);
        b[offset..offset + 8].copy_from_slice(&v.to_le_bytes());
        assert!(begin(&mut s, &b).is_err());
    }
    assert!(begin(&mut s, &cfg(5, 3, 65535)).is_err());
    for kind in [1u32, 2] {
        let mut b = cfg(1, 1, 65535);
        b[20..24].copy_from_slice(&kind.to_le_bytes());
        let id = begin(&mut s, &b).unwrap();
        let out = finish(&mut s, id);
        assert_eq!(
            &out[32..],
            if kind == 1 {
                &[0, 0, 0, 255]
            } else {
                &[0, 0, 0, 128]
            }
        );
        s.release(id).unwrap();
    }
}
#[test]
fn retained_borrowed_atlas_aggregate_jobs_rollback_and_invalidation() {
    let mut s = RenderSession::new(20000).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    upload(&mut s, 2, &atlas(2, 40, 40)).unwrap();
    let base = s.storage_bytes();
    let a = begin(&mut s, &cfg(5, 3, 65535)).unwrap();
    let one = s.storage_bytes();
    let b = begin(&mut s, &cfg(5, 3, 65535)).unwrap();
    assert_eq!(s.storage_bytes() - one, one - base);
    assert!(one - base < 3200, "atlas cloned into job");
    assert!(begin(&mut s, &cfg(5, 3, 65535)).is_err());
    let mut bad = atlas(2, 1, 1);
    bad[0] = 2;
    assert!(upload(&mut s, 2, &bad).is_err());
    assert_eq!(s.step(a, 0).unwrap(), JobStatus::Pending);
    assert_eq!(
        upload(&mut s, 2, &atlas(2, 80, 80)),
        Err(RenderError::BudgetExceeded)
    );
    assert_eq!(s.step(b, 0).unwrap(), JobStatus::Pending);
    finish(&mut s, a);
    s.release(a).unwrap();
    s.cancel(b).unwrap();
    assert_eq!(s.storage_bytes(), base);
    let a = begin(&mut s, &cfg(5, 3, 65535)).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    assert_eq!(s.step(a, 1).unwrap(), JobStatus::Pending);
    s.cancel(a).unwrap();
    let a = begin(&mut s, &cfg(5, 3, 65535)).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    assert!(s.step(a, 1).is_err());
}
#[test]
fn stage_admission_cannot_consume_active_profile_serialization_headroom() {
    let mut s = RenderSession::new(4000).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    let id = begin(&mut s, &cfg(5, 3, 65535)).unwrap();
    let free = 4000 - s.storage_bytes();
    assert_eq!(s.stage(free - 1), Err(RenderError::BudgetExceeded));
    let out = finish(&mut s, id);
    assert_eq!(out.len(), 152);
    s.release(id).unwrap();
}
#[test]
fn zero_area_preserves_nonzero_floor_column_count() {
    let mut s = RenderSession::new(100000).unwrap();
    upload(&mut s, 1, &src(5, 2)).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    let id = begin(&mut s, &cfg(5, 2, 65535)).unwrap();
    let out = finish(&mut s, id);
    assert_eq!(
        (u(&out, 12), u(&out, 16), u(&out, 24), out.len()),
        (2, 0, 0, 72)
    );
}
#[test]
fn exact_nonempty_fractional_mask_frame_from_profile_abi() {
    let mut s = RenderSession::new(100000).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    let mut a = atlas(2, 1, 1);
    a[32] = 255;
    upload(&mut s, 2, &a).unwrap();
    let mut b = cfg(5, 3, 65535);
    b[96..104].copy_from_slice(&(-0.5f64).to_le_bytes());
    b[104..112].copy_from_slice(&0.5f64.to_le_bytes());
    let id = begin(&mut s, &b).unwrap();
    let out = finish(&mut s, id);
    let mut expected = vec![0u8; 60];
    for (x, y, alpha) in [(1usize, 0usize, 89), (2, 0, 38), (1, 1, 89), (2, 1, 38)] {
        expected[(y * 5 + x) * 4..(y * 5 + x) * 4 + 4].copy_from_slice(&[255, 255, 255, alpha]);
    }
    assert_eq!(&out[32..92], expected);
}
#[test]
fn maximum_count_and_explicit_sentinel_boundaries() {
    let mut s = RenderSession::new(100000).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    upload(&mut s, 2, &atlas(256, 1, 1)).unwrap();
    for space in [255u32, 65535] {
        let mut b = cfg(5, 3, space);
        b[16..20].copy_from_slice(&256u32.to_le_bytes());
        let id = begin(&mut s, &b).unwrap();
        finish(&mut s, id);
        s.release(id).unwrap();
    }
    for space in [256u32, 65534] {
        let mut b = cfg(5, 3, space);
        b[16..20].copy_from_slice(&256u32.to_le_bytes());
        assert!(begin(&mut s, &b).is_err());
    }
}
#[test]
fn cropped_rotated_scale_two_has_independent_flat_probe_bytes() {
    let mut s = RenderSession::new(100000).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    let mut b = cfg(6, 6, 65535);
    b[12..16].copy_from_slice(&90u32.to_le_bytes());
    b[40..48].copy_from_slice(&2f64.to_le_bytes());
    b[64..72].copy_from_slice(&0.4f64.to_le_bytes());
    b[80..88].copy_from_slice(&0.6f64.to_le_bytes());
    let id = begin(&mut s, &b).unwrap();
    let out = finish(&mut s, id);
    assert_eq!(
        (
            u(&out, 4),
            u(&out, 8),
            u(&out, 12),
            u(&out, 16),
            u(&out, 24),
            out.len()
        ),
        (6, 6, 1, 1, 176, 224)
    );
    assert!(out[32..176].iter().all(|v| *v == 0));
    assert_eq!(u16::from_le_bytes(out[208..210].try_into().unwrap()), 65535);
}

#[test]
fn complete_context_reserves_all_active_future_scratch_before_begin() {
    let mut s = RenderSession::new(18000).unwrap();
    upload(&mut s, 1, &src(16, 16)).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    let mut b = cfg(16, 16, 65535);
    b[20..24].copy_from_slice(&2u32.to_le_bytes());
    let base = s.storage_bytes();
    let id = begin(&mut s, &b).unwrap();
    let one = s.storage_bytes();
    assert_eq!(begin(&mut s, &b), Err(RenderError::BudgetExceeded));
    assert_eq!(s.storage_bytes(), one);
    finish(&mut s, id);
    s.release(id).unwrap();
    assert_eq!(s.storage_bytes(), base);
    let id = begin(&mut s, &b).unwrap();
    s.cancel(id).unwrap();
    assert_eq!(s.storage_bytes(), base);
}

#[test]
fn captured_atlases_survive_replacement_and_release_unique_storage() {
    for (w, h, backdrop, work) in [
        (5, 3, 0u32, 1),
        (16, 16, 2, 350),
        (1, 1, 2, 1),
        (5, 2, 0, 1),
    ] {
        let mut config = cfg(w, h, 65535);
        config[20..24].copy_from_slice(&backdrop.to_le_bytes());
        let a = atlas(2, 1, 1);
        let mut b = atlas(2, 3, 2);
        b[32..44].fill(255);
        let oracle = |data: &[u8]| {
            let mut fixed = RenderSession::new(100000).unwrap();
            upload(&mut fixed, 1, &src(w, h)).unwrap();
            upload(&mut fixed, 2, data).unwrap();
            let id = begin(&mut fixed, &config).unwrap();
            finish(&mut fixed, id)
        };
        let expected_a = oracle(&a);
        let expected_b = oracle(&b);
        let mut s = RenderSession::new(100000).unwrap();
        upload(&mut s, 1, &src(w, h)).unwrap();
        upload(&mut s, 2, &a).unwrap();
        let base_a = s.storage_bytes();
        let old = begin(&mut s, &config).unwrap();
        s.step(old, work).unwrap();
        upload(&mut s, 2, &b).unwrap();
        let new = begin(&mut s, &config).unwrap();
        assert_eq!(finish(&mut s, old), expected_a);
        s.release(old).unwrap();
        assert_eq!(finish(&mut s, new), expected_b);
        s.release(new).unwrap();
        let base_b = s.storage_bytes();
        // Distinct actual mask capacity is charged even if both contain identical bytes.
        assert_eq!(base_b - base_a, 10);
        let old = begin(&mut s, &config).unwrap();
        upload(&mut s, 2, &a).unwrap();
        let retained = s.storage_bytes();
        s.cancel(old).unwrap();
        assert!(retained - s.storage_bytes() >= 12 + 80);
        assert_eq!(s.storage_bytes(), base_a);
    }
}

#[test]
fn replacement_keeps_profile_but_invalidates_legacy_and_source_cancels_both() {
    let mut s = RenderSession::new(100000).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    let profile = begin(&mut s, &cfg(5, 3, 65535)).unwrap();
    let mut legacy = CharacterSettings::new(1, 1).unwrap();
    legacy.mapping = Mapping::Glyph;
    let legacy = s.begin(legacy).unwrap();
    upload(&mut s, 2, &atlas(2, 1, 1)).unwrap();
    assert!(s.step(legacy, 1).is_err());
    assert_eq!(s.step(profile, 0).unwrap(), JobStatus::Pending);
    let second = begin(&mut s, &cfg(5, 3, 65535)).unwrap();
    upload(&mut s, 1, &src(5, 3)).unwrap();
    assert!(s.step(profile, 1).is_err());
    assert!(s.step(second, 1).is_err());
}
