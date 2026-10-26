use asciimorph_engine::{
    abi,
    character::{Crop, JobStatus},
    session::RenderSession,
    styles::{
        contract::{Family, StyleSettings},
        wire::encode_style_settings,
    },
};

#[test]
fn public_profile_session_converts_finished_pixel_output_and_keeps_abi_additive() {
    assert_eq!(abi::render_thumbnail_profile_version(), 1);
    assert_eq!(abi::render_frame_thumbnail_v1(0, 0, 192), 0);
    let mut session = RenderSession::new(1_000_000).unwrap();
    let mut source = Vec::new();
    for value in [1u32, 1, 3, 2, 0, 0, 0, 0] {
        source.extend(value.to_le_bytes());
    }
    source.extend([25, 50, 75, 255].repeat(6));
    let pointer = session.stage(source.len()).unwrap();
    session.stage_mut(pointer).unwrap().copy_from_slice(&source);
    session.upload(1, pointer, source.len()).unwrap();
    session.unstage(pointer).unwrap();
    let settings = StyleSettings {
        family: Family::Pixel,
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
        atlas_count: 0,
        atlas_origin_x: 0.,
        atlas_origin_y: 0.,
        space_index: 65535,
        font_size: 11,
        brightness: 0.,
        contrast: 20.,
        invert: false,
        opacity: 100.,
    };
    let packet = encode_style_settings(&settings).unwrap();
    let pointer = session.stage(packet.len()).unwrap();
    session.stage_mut(pointer).unwrap().copy_from_slice(&packet);
    let id = session.begin_style_staged(pointer, packet.len()).unwrap();
    session.unstage(pointer).unwrap();
    while session.step(id, 4096).unwrap() != JobStatus::Complete {}
    let original = session.frame_output(id).unwrap().to_vec();
    session.frame_thumbnail(id, 2).unwrap();
    assert_eq!(session.frame_output(id).unwrap(), original);
    while session.step(id, 1).unwrap() != JobStatus::Complete {}
    let output = session.frame_output(id).unwrap();
    assert_eq!(
        &output[0..16],
        &[1u32, 2, 1, 8]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect::<Vec<_>>()
    );
    assert_eq!(output.len(), 24);
    session.release(id).unwrap();
}
