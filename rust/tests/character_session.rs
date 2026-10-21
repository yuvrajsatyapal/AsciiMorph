use asciimorph_engine::{
    abi,
    character::{CharacterJob, CharacterSettings, JobStatus, Mapping, RenderError},
    session::RenderSession,
};
fn source(width: u32, value: u8) -> Vec<u8> {
    let mut b = Vec::new();
    for v in [1u32, 1, width, 1, 0, 0, 0, 0] {
        b.extend_from_slice(&v.to_le_bytes());
    }
    b.extend(vec![value; width as usize * 4]);
    b
}
fn upload(s: &mut RenderSession, b: &[u8]) -> Result<(), RenderError> {
    let p = s.stage(b.len())?;
    s.stage_mut(p)?.copy_from_slice(b);
    let result = s.upload(1, p, b.len());
    s.unstage(p).unwrap();
    result
}
fn settings() -> CharacterSettings {
    let mut s = CharacterSettings::new(1, 1).unwrap();
    s.mapping = Mapping::Braille;
    s
}
#[test]
fn stale_handles_reject() {
    let h = abi::render_create(4096);
    assert_ne!(h, 0);
    assert_eq!(abi::render_drop(h), 1);
    assert_eq!(abi::render_drop(h), 0);
    assert_eq!(abi::render_stage(h, 32), 0);
    assert_eq!(abi::render_upload(0, 1, u32::MAX, 32), 0);
}
#[test]
fn budget_rejection_preserves_previous_source() {
    let mut s = RenderSession::new(256).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    assert!(upload(&mut s, &source(28, 0)).is_err());
    assert_eq!(s.source().unwrap().rgba(), &[255; 4]);
}
#[test]
fn cancel_releases_job_scratch() {
    let mut s = RenderSession::new(20000).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    let base = s.storage_bytes();
    let id = s.begin(settings()).unwrap();
    assert!(s.storage_bytes() > base);
    s.cancel(id).unwrap();
    assert_eq!(s.storage_bytes(), base);
    assert!(s.step(id, 1).is_err());
}
#[test]
fn two_jobs_and_output_release() {
    let mut s = RenderSession::new(20000).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    let a = s.begin(settings()).unwrap();
    let b = s.begin(settings()).unwrap();
    assert!(s.begin(settings()).is_err());
    assert_eq!(s.step(a, 0).unwrap(), JobStatus::Pending);
    while s.step(a, 1).unwrap() != JobStatus::Complete {}
    let out = s.output(a).unwrap();
    assert_eq!(u32::from_le_bytes(out[0..4].try_into().unwrap()), 1);
    assert_eq!(out.len(), 48);
    s.release(a).unwrap();
    assert!(s.release(a).is_err());
    s.cancel(b).unwrap();
    assert_eq!(s.storage_bytes(), 4);
}
#[test]
fn invalid_stages_and_upload_headers_reject() {
    let mut s = RenderSession::new(4096).unwrap();
    assert!(s.upload(1, usize::MAX, 32).is_err());
    let p = s.stage(36).unwrap();
    s.stage_mut(p).unwrap().copy_from_slice(&source(1, 255));
    assert!(s.upload(1, p + 1, 35).is_err());
    assert!(s.upload(1, p, 37).is_err());
    s.stage_mut(p).unwrap()[0] = 2;
    assert!(s.upload(1, p, 36).is_err());
    s.unstage(p).unwrap();
    assert!(s.upload(1, p, 36).is_err());
}
#[test]
fn required_storage_matches_actual_vectors() {
    let mut s = RenderSession::new(20000).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    for mapping in [Mapping::Glyph, Mapping::Braille] {
        let mut cfg = settings();
        cfg.mapping = mapping;
        if mapping == Mapping::Braille {
            let job = CharacterJob::new(s.source().unwrap(), cfg.clone(), None).unwrap();
            assert_eq!(
                CharacterJob::required_storage_bytes(&cfg).unwrap(),
                job.storage_bytes()
            );
        }
    }
}
fn wire_settings() -> Vec<u8> {
    let mut b = Vec::new();
    for v in [1u32, 1, 1, 0, 0, 2, 1, 0] {
        b.extend_from_slice(&v.to_le_bytes())
    }
    for v in [
        10f64, 18., 0., 0., 1., 1., 0., 0., 1., 100., 1., 0., 0., 16777215., -1., 0.,
    ] {
        b.extend_from_slice(&v.to_le_bytes())
    }
    b
}
fn calibration(flags: u32, directions: [u32; 4]) -> Vec<u8> {
    let mut b = Vec::new();
    for v in [1u32, 2, 0, 0, 4, 1, 1, flags] {
        b.extend_from_slice(&v.to_le_bytes())
    }
    b.extend_from_slice(&[0, 80, 160, 255]);
    for _ in 0..40 {
        b.extend_from_slice(&0.5f32.to_le_bytes())
    }
    if flags == 1 {
        for v in directions {
            b.extend_from_slice(&v.to_le_bytes())
        }
    }
    b
}
#[test]
fn malformed_settings_fail_before_execution() {
    use asciimorph_engine::session::decode_settings;
    assert!(decode_settings(&wire_settings()).is_ok());
    for (offset, value) in [
        (0, 2u32),
        (4, u32::MAX),
        (12, 65536),
        (16, 16),
        (20, 3),
        (24, 2),
    ] {
        let mut b = wire_settings();
        b[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        assert!(decode_settings(&b).is_err());
    }
    for (offset, value) in [(32, f64::NAN), (136, 1.5), (144, -2.), (152, 2.)] {
        let mut b = wire_settings();
        b[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
        assert!(decode_settings(&b).is_err());
    }
    assert!(decode_settings(&wire_settings()[..159]).is_err());
}
#[test]
fn directional_metadata_is_validated() {
    let mut s = RenderSession::new(20000).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    let mut cfg = settings();
    cfg.mapping = Mapping::Glyph;
    cfg.smart_edges = true;
    for (flags, directions, ok) in [
        (0, [0, 1, 2, 3], true),
        (1, [0, 1, 2, 3], true),
        (1, [0, 0, 2, 3], false),
        (1, [0, 1, 2, 4], false),
        (2, [0, 1, 2, 3], false),
    ] {
        let b = calibration(flags, directions);
        let p = s.stage(b.len()).unwrap();
        s.stage_mut(p).unwrap().copy_from_slice(&b);
        assert_eq!(s.upload(2, p, b.len()).is_ok(), ok);
        s.unstage(p).unwrap();
        if flags == 0 {
            assert!(s.begin(cfg.clone()).is_err());
        }
        if flags == 1 && ok {
            let id = s.begin(cfg.clone()).unwrap();
            s.cancel(id).unwrap();
        }
    }
}
#[test]
fn aggregate_jobs_and_serialization_peak_are_preflighted() {
    let mut s = RenderSession::new(800).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    let cfg = settings();
    assert_eq!(CharacterJob::required_storage_bytes(&cfg).unwrap(), 238);
    let a = s.begin(cfg.clone()).unwrap();
    let b = s.begin(cfg).unwrap();
    assert_eq!(s.storage_bytes(), 480); // retained source + two jobs
    let p = s.stage(300).unwrap(); // staging may consume serialization headroom
    assert!(s.step(a, 10000).is_err());
    assert_eq!(s.storage_bytes(), 780);
    s.unstage(p).unwrap();
    assert_eq!(s.step(a, 1).unwrap(), JobStatus::Complete);
    assert_eq!(s.step(b, 10000).unwrap(), JobStatus::Complete);
    s.release(a).unwrap();
    s.release(b).unwrap();
    assert_eq!(s.storage_bytes(), 4);
    let mut tiny = RenderSession::new(280).unwrap();
    upload(&mut tiny, &source(1, 255)).unwrap();
    assert!(tiny.begin(settings()).is_err()); // 4 + 238 + 48 serialization exceeds 280
    assert_eq!(tiny.storage_bytes(), 4);
}
#[test]
fn failed_replacement_preserves_jobs_and_success_invalidates_ids() {
    let mut s = RenderSession::new(1000).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    let id = s.begin(settings()).unwrap();
    let mut bad = source(1, 0);
    bad[0] = 2;
    assert!(upload(&mut s, &bad).is_err());
    assert_eq!(s.step(id, 0).unwrap(), JobStatus::Pending);
    upload(&mut s, &source(1, 0)).unwrap();
    assert!(s.step(id, 1).is_err());
    let next = s.begin(settings()).unwrap();
    assert!(next > id);
}
#[test]
fn calibration_replacement_preserves_braille_jobs() {
    let mut s = RenderSession::new(20000).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    let id = s.begin(settings()).unwrap();
    let b = calibration(1, [0, 1, 2, 3]);
    let p = s.stage(b.len()).unwrap();
    s.stage_mut(p).unwrap().copy_from_slice(&b);
    s.upload(2, p, b.len()).unwrap();
    s.unstage(p).unwrap();
    assert_eq!(s.step(id, 1000).unwrap(), JobStatus::Complete);
}
#[test]
fn required_storage_covers_shape_and_braille_variants() {
    use asciimorph_engine::{glyph::GlyphCalibration, source::SourceImage};
    let source = SourceImage::new(1, 1, vec![255; 4], 100_000).unwrap();
    let calibration =
        GlyphCalibration::new(2, 1, 1, vec![0, 255], vec![0., 1.], vec![0.; 18]).unwrap();
    for mapping in [Mapping::Glyph, Mapping::Braille] {
        for shape_aware in [false, true] {
            let mut cfg = CharacterSettings::new(3, 2).unwrap();
            cfg.mapping = mapping;
            cfg.shape_aware = shape_aware;
            let job = CharacterJob::new(&source, cfg.clone(), Some(&calibration)).unwrap();
            assert_eq!(
                CharacterJob::required_storage_bytes(&cfg).unwrap(),
                job.storage_bytes()
            );
        }
    }
}
#[test]
fn malformed_calibration_preserves_previous_dictionary_and_job() {
    let mut s = RenderSession::new(10_000).unwrap();
    upload(&mut s, &source(1, 255)).unwrap();
    let b = calibration(1, [0, 1, 2, 3]);
    let p = s.stage(b.len()).unwrap();
    s.stage_mut(p).unwrap().copy_from_slice(&b);
    s.upload(2, p, b.len()).unwrap();
    s.unstage(p).unwrap();
    let mut cfg = settings();
    cfg.mapping = Mapping::Glyph;
    cfg.smart_edges = true;
    let id = s.begin(cfg).unwrap();
    for (offset, value) in [
        (4, 9u32),
        (16, u32::MAX),
        (20, u32::MAX),
        (28, 2),
        (36, f32::NAN.to_bits()),
    ] {
        let mut bad = b.clone();
        bad[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        let p = s.stage(bad.len()).unwrap();
        s.stage_mut(p).unwrap().copy_from_slice(&bad);
        assert!(s.upload(2, p, bad.len()).is_err());
        s.unstage(p).unwrap();
        assert_eq!(s.step(id, 0).unwrap(), JobStatus::Pending);
    }
    while s.step(id, 1).unwrap() != JobStatus::Complete {}
}
#[test]
fn only_one_live_stage_can_allocate_per_session() {
    let mut s = RenderSession::new(10_000).unwrap();
    let p = s.stage(1).unwrap();
    for _ in 0..1000 {
        assert!(s.stage(1).is_err());
    }
    assert_eq!(s.storage_bytes(), 1);
    s.unstage(p).unwrap();
    let replacement = s.stage(2).unwrap();
    assert_eq!(s.storage_bytes(), 2);
    s.unstage(replacement).unwrap();
    assert_eq!(s.storage_bytes(), 0);
}
#[test]
fn live_session_cap_does_not_recycle_stale_handles() {
    let handles: Vec<u32> = (0..16).map(|_| abi::render_create(4096)).collect();
    assert!(handles.iter().all(|h| *h != 0));
    assert_eq!(abi::render_create(4096), 0);
    assert_eq!(abi::render_drop(handles[0]), 1);
    let replacement = abi::render_create(4096);
    assert!(replacement > *handles.last().unwrap());
    assert_eq!(abi::render_drop(handles[0]), 0);
    assert_eq!(abi::render_stage(handles[0], 1), 0);
    for handle in handles.into_iter().skip(1) {
        assert_eq!(abi::render_drop(handle), 1);
    }
    assert_eq!(abi::render_drop(replacement), 1);
}
