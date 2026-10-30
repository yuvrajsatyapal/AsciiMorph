//! Bounded, deterministic alpha-weighted area sampling and Sobel gradients.
pub mod abi;
pub mod session;
pub mod styles;

pub mod character;
pub mod character_backdrop;
pub mod color;
pub mod dither;
pub mod glyph;
pub mod reference_characters;
pub mod source;

pub fn sample(input: &[u8], iw: usize, ih: usize, ow: usize, oh: usize, out: &mut [f64]) {
    for y in 0..oh {
        for x in 0..ow {
            let (x0, x1) = (
                x as f64 * iw as f64 / ow as f64,
                (x + 1) as f64 * iw as f64 / ow as f64,
            );
            let (y0, y1) = (
                y as f64 * ih as f64 / oh as f64,
                (y + 1) as f64 * ih as f64 / oh as f64,
            );
            let (mut r, mut g, mut b, mut alpha, mut area) = (0.0, 0.0, 0.0, 0.0, 0.0);
            for yy in y0.floor() as usize..y1.ceil() as usize {
                for xx in x0.floor() as usize..x1.ceil() as usize {
                    let weight = ((xx + 1) as f64).min(x1) - (xx as f64).max(x0);
                    let weight = weight * (((yy + 1) as f64).min(y1) - (yy as f64).max(y0));
                    let i = (yy * iw + xx) * 4;
                    let a = input[i + 3] as f64 / 255.0;
                    r += input[i] as f64 * a * weight;
                    g += input[i + 1] as f64 * a * weight;
                    b += input[i + 2] as f64 * a * weight;
                    alpha += a * weight;
                    area += weight;
                }
            }
            let i = (y * ow + x) * 4;
            out[i] = if alpha > 0.0 { r / alpha } else { 0.0 };
            out[i + 1] = if alpha > 0.0 { g / alpha } else { 0.0 };
            out[i + 2] = if alpha > 0.0 { b / alpha } else { 0.0 };
            out[i + 3] = if area > 0.0 { alpha / area } else { 0.0 };
        }
    }
}

pub fn gradients(values: &[f32], w: usize, h: usize, out: &mut [f64]) {
    let at = |x: isize, y: isize| {
        values[y.clamp(0, h as isize - 1) as usize * w + x.clamp(0, w as isize - 1) as usize] as f64
    };
    for y in 0..h as isize {
        for x in 0..w as isize {
            let i = (y as usize * w + x as usize) * 3;
            let mut blur = 0.0;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    blur += at(x + dx, y + dy) / 9.0;
                }
            }
            out[i] = blur;
            out[i + 1] = -at(x - 1, y - 1) + at(x + 1, y - 1) - 2.0 * at(x - 1, y)
                + 2.0 * at(x + 1, y)
                - at(x - 1, y + 1)
                + at(x + 1, y + 1);
            out[i + 2] = -at(x - 1, y - 1) - 2.0 * at(x, y - 1) - at(x + 1, y - 1)
                + at(x - 1, y + 1)
                + 2.0 * at(x, y + 1)
                + at(x + 1, y + 1);
        }
    }
}

// Allocations use u64 alignment so both f32 and f64 views are valid.
#[no_mangle]
pub extern "C" fn alloc(bytes: usize) -> *mut u8 {
    if bytes == 0 || bytes > 32_000_000 {
        return std::ptr::null_mut();
    }
    let data = vec![0u64; bytes.div_ceil(8)].into_boxed_slice();
    Box::into_raw(data) as *mut u8
}

/// # Safety
/// `ptr` must be an allocation returned by `alloc` with this exact byte count.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, bytes: usize) {
    if !ptr.is_null() {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
            ptr as *mut u64,
            bytes.div_ceil(8),
        )));
    }
}

/// # Safety
/// Input and output must refer to allocated buffers of iw*ih*4 and ow*oh*32 bytes.
#[no_mangle]
pub unsafe extern "C" fn sample_rgba(
    input: *const u8,
    iw: usize,
    ih: usize,
    ow: usize,
    oh: usize,
    output: *mut f64,
) -> u32 {
    if input.is_null()
        || output.is_null()
        || iw == 0
        || ih == 0
        || iw > 2048
        || ih > 2048
        || ow == 0
        || oh == 0
        || ow > 600
        || oh > 1200
    {
        return 0;
    }
    sample(
        std::slice::from_raw_parts(input, iw * ih * 4),
        iw,
        ih,
        ow,
        oh,
        std::slice::from_raw_parts_mut(output, ow * oh * 4),
    );
    1
}

/// # Safety
/// Input/output must contain w*h f32 and w*h*3 f64 respectively.
#[no_mangle]
pub unsafe extern "C" fn sobel(input: *const f32, w: usize, h: usize, output: *mut f64) -> u32 {
    if input.is_null() || output.is_null() || w == 0 || h == 0 || w > 600 || h > 1200 {
        return 0;
    }
    gradients(
        std::slice::from_raw_parts(input, w * h),
        w,
        h,
        std::slice::from_raw_parts_mut(output, w * h * 3),
    );
    1
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transparent_colors_do_not_bleed() {
        let mut output = [0.0; 4];
        sample(&[255, 0, 0, 0, 0, 100, 200, 255], 2, 1, 1, 1, &mut output);
        assert_eq!(output, [0.0, 100.0, 200.0, 0.5]);
    }
    #[test]
    fn fractional_area_and_sobel() {
        let mut output = [0.0; 12];
        sample(&[0, 0, 0, 255, 255, 255, 255, 255], 2, 1, 3, 1, &mut output);
        assert!((output[4] - 127.5).abs() < 1e-10);
        let mut edges = [0.0; 9];
        gradients(&[0.0, 127.5, 255.0], 3, 1, &mut edges);
        assert_eq!(edges[4], 1020.0);
        assert_eq!(edges[5], 0.0);
    }
}

mod canvas_blur;
pub mod style_context;
