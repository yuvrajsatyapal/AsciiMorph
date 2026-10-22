//! Native numeric outputs for cross-runtime byte-equivalence tests. Analytic kernel,
//! interpolation and composition oracles live in character_backdrop tests separately.
use asciimorph_engine::{
    character::{Crop, JobStatus},
    character_backdrop::CompleteCharactersJob,
    reference_characters::{ReferenceAtlas, ReferenceBackdrop, ReferenceCharactersSettings},
    source::SourceImage,
};
fn main() {
    let pixels: Vec<u8> = (0..15u8)
        .flat_map(|i| {
            if i % 5 == 0 {
                [255, 0, 0, 0]
            } else {
                [
                    i * 17,
                    255 - i * 13,
                    i * 11,
                    if i % 3 == 0 { 128 } else { 255 },
                ]
            }
        })
        .collect();
    let source = SourceImage::new(5, 3, pixels.clone(), 268435456).unwrap();
    let atlas =
        ReferenceAtlas::new(2, 2, 2, vec![255, 128, 64, 0, 0, 0, 0, 0], -0.5, 0.5, 65535).unwrap();
    print!("{{\"source\":{{\"width\":5,\"height\":3,\"rgba\":{:?}}},\"masks\":[255,128,64,0,0,0,0,0],\"cases\":[",pixels);
    let mut first = true;
    for (scale, font_size, rotation, crop, w, h) in [
        (
            1,
            3.,
            0,
            Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            5,
            3,
        ),
        (
            4,
            3.,
            0,
            Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            20,
            12,
        ),
        (
            4,
            3.,
            90,
            Crop {
                x: 0.2,
                y: 0.,
                width: 0.8,
                height: 1.,
            },
            12,
            16,
        ),
        (
            1,
            80.,
            0,
            Crop {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            5,
            3,
        ),
    ] {
        for (backdrop, name) in [
            (ReferenceBackdrop::None, "none"),
            (ReferenceBackdrop::Solid, "solid"),
            (ReferenceBackdrop::Blur, "blur"),
        ] {
            if !first {
                print!(",");
            }
            first = false;
            let s = ReferenceCharactersSettings {
                version: 1,
                frame_width: w,
                frame_height: h,
                font_size,
                render_scale: scale,
                brightness: 0.,
                contrast: 20.,
                crop,
                rotation,
                backdrop,
            };
            let mut j = CompleteCharactersJob::new(&source, s, &atlas, 0).unwrap();
            while j.step(&source, &atlas, 13).unwrap() != JobStatus::Complete {}
            let frame = j.take_frame().unwrap();
            print!("{{\"scale\":{scale},\"fontSize\":{font_size},\"rotation\":{rotation},\"crop\":{{\"x\":{},\"y\":{},\"width\":{},\"height\":{}}},\"width\":{w},\"height\":{h},\"backdrop\":\"{name}\",\"rgba\":{:?},\"grid\":",crop.x,crop.y,crop.width,crop.height,frame.rgba);
            if let Some(g) = frame.grid {
                print!(
                    "{{\"indices\":{:?},\"foreground\":{:?},\"alpha\":{:?}}}",
                    g.glyph_indices, g.foreground, g.alpha
                );
            } else {
                print!("null");
            }
            print!("}}");
        }
    }
    println!("]}}");
}
