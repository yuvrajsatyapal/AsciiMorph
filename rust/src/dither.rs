//! A diffusion update touches at most four neighbors and retains f32 boundaries.
pub(crate) fn diffuse(values: &mut [f32], width: usize, height: usize, index: usize, error: f64) {
    let x = index % width;
    let y = index / width;
    for (dx, dy, weight) in [
        (1, 0, 7.0 / 16.0),
        (-1, 1, 3.0 / 16.0),
        (0, 1, 5.0 / 16.0),
        (1, 1, 1.0 / 16.0),
    ] {
        let xx = x as isize + dx;
        let yy = y + dy;
        if xx >= 0 && (xx as usize) < width && yy < height {
            let target = yy * width + xx as usize;
            values[target] = (values[target] as f64 + error * weight) as f32;
        }
    }
}
