use asciimorph_engine::style_context::{blend_pixel, StyleContext};
#[test]
fn blend_alpha_and_coverage_endpoints() {
    let mut p = [200, 100, 0, 128];
    blend_pixel(&mut p, [0., 0., 128., 128. / 255.], 0);
    assert_eq!(p, [134, 67, 85, 192]);
    let c = StyleContext::default();
    assert!(c.occupied(0, 0));
    let mut c = c;
    c.coverage = 0.;
    assert!(!c.occupied(0, 0));
}
#[test]
fn independently_computed_blends_and_transparent_endpoints() {
    // Opaque normalized source=.8, backdrop=.4: overlay=.64, dodge=1, screen=.88.
    for (mode, expected) in [(1, 163), (2, 255), (3, 224), (4, 255)] {
        let mut p = [204, 204, 204, 255];
        blend_pixel(&mut p, [102., 102., 102., 1.], mode);
        assert_eq!(p, [expected, expected, expected, 255]);
    }
    for mode in 0..5 {
        let mut p = [51, 102, 153, 128];
        blend_pixel(&mut p, [0.; 4], mode);
        assert_eq!(p, [51, 102, 153, 128]);
    }
}
#[test]
fn strict_context_packet_and_hash_extremes() {
    let mut b = [0u8; 64];
    for (o, v) in [(0, 0x31584353u32), (4, 1), (8, 3)] {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }
    for (o, v) in [(16, 60f64), (24, 100.), (32, 100.), (40, 100.)] {
        b[o..o + 8].copy_from_slice(&v.to_le_bytes());
    }
    let c = StyleContext::decode(&b).unwrap();
    for y in 0..12 {
        for x in 0..12 {
            assert!(c.occupied(x, y));
        }
    }
    for o in [0, 4, 8, 12, 48, 52, 60] {
        let mut bad = b;
        bad[o..o + 4].copy_from_slice(&999u32.to_le_bytes());
        assert!(StyleContext::decode(&bad).is_err());
    }
    for o in [16, 24, 32, 40] {
        let mut bad = b;
        bad[o..o + 8].copy_from_slice(&f64::NAN.to_le_bytes());
        assert!(StyleContext::decode(&bad).is_err());
    }
    assert!(StyleContext::decode(&b[..63]).is_err());
    let mut c = c;
    c.coverage = 50.;
    let mut d = c;
    d.seed = 17;
    assert!((0..100).any(|x| c.occupied(x, 0) != d.occupied(x, 0)));
}
