use asciimorph_engine::{gradients, sample};
use std::{hint::black_box, time::Instant};
fn main() {
    let pixels: Vec<u8> = (0..1024 * 768 * 4)
        .map(|i| ((i * 37 + i % 11) % 256) as u8)
        .collect();
    let mut output = vec![0.0; 160 * 80 * 4];
    let mut edge_output = vec![0.0; 160 * 80 * 3];
    let values: Vec<f32> = (0..160 * 80).map(|i| (i % 256) as f32).collect();
    let start = Instant::now();
    for _ in 0..50 {
        sample(
            black_box(&pixels),
            1024,
            768,
            160,
            80,
            black_box(&mut output),
        );
        gradients(black_box(&values), 160, 80, black_box(&mut edge_output));
    }
    println!(
        "Rust native: {:.3} ms per 1024×768 → 160×80 sample + Sobel (50 iterations)",
        start.elapsed().as_secs_f64() * 1000.0 / 50.0
    );
}
