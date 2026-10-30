//! Separable Canvas raster blur with transparent outsets. The combined box
//! kernel retains out-of-frame intermediate contributions without padded planes.
#[derive(Debug)]
pub(crate) struct CanvasBlur {
    weights: [f64; 337],
    radius: usize,
    divisor: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canvas_oracles_cover_even_windows_and_softness_extrema() {
        // Chromium156 Canvas2D: opaque white 101-square blurred over black.
        // Tuple: softness, left edge at y50, corner, center.
        for (sigma, edge, corner, center) in [
            (1., 170., 113., 255.),
            (2., 150., 88., 255.),
            (3., 143., 80., 255.),
            (20., 130., 66., 253.),
            (60., 73., 55., 95.),
        ] {
            let blur = CanvasBlur::new(sigma);
            let mut a = vec![[255., 255., 255., 1.]; 101 * 101];
            let mut b = vec![[0.; 4]; 101 * 101];
            for pass in 0..2 {
                for cursor in 0..a.len() {
                    blur.pixel(&a, &mut b, 101, 101, pass, cursor);
                }
                std::mem::swap(&mut a, &mut b);
            }
            assert_eq!(
                [a[50 * 101][0], a[0][0], a[50 * 101 + 50][0]],
                [edge, corner, center],
                "softness={sigma}"
            );
        }
    }
}
impl CanvasBlur {
    pub fn new(sigma: f64) -> Self {
        // Skia's raster three-box approximation. Even windows use opposite
        // half-pixel shifts and a final window one sample wider.
        let w = (sigma * 3. * (2. * std::f64::consts::PI).sqrt() / 4. + 0.5)
            .floor()
            .max(1.) as usize;
        let widths = [w, w, w + usize::from(w % 2 == 0)];
        let radius = (widths.iter().sum::<usize>() - 3) / 2;
        let mut result = Self {
            weights: [0.; 337],
            radius,
            divisor: widths.iter().product::<usize>() as f64,
        };
        let triangle = |n: isize| {
            if n < 0 {
                0.
            } else {
                ((n + 1) * (n + 2)) as f64 / 2.
            }
        };

        for t in 0..=2 * radius {
            let mut count = 0.;
            for mask in 0u32..8 {
                let shift: usize = widths
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| mask & (1 << i) != 0)
                    .map(|(_, w)| w)
                    .sum();
                count += if mask.count_ones() % 2 == 0 { 1. } else { -1. }
                    * triangle(t as isize - shift as isize);
            }
            result.weights[t] = count;
        }
        result
    }
    /// One bounded output, no allocation. Crop only after each full axis kernel;
    /// cropping between its constituent boxes would discard blurred outsets.
    pub fn pixel(
        &self,
        a: &[[f32; 4]],
        b: &mut [[f32; 4]],
        w: usize,
        h: usize,
        pass: usize,
        cursor: usize,
    ) {
        let (x, y) = (cursor % w, cursor / w);
        let (position, length) = if pass == 0 { (x, w) } else { (y, h) };
        let mut sum = [0.; 4];
        for (i, weight) in self.weights[..=2 * self.radius].iter().enumerate() {
            let p = position as isize + i as isize - self.radius as isize;
            if p < 0 || p >= length as isize {
                continue;
            }
            let index = if pass == 0 {
                y * w + p as usize
            } else {
                p as usize * w + x
            };
            for k in 0..4 {
                sum[k] += a[index][k] as f64 * weight;
            }
        }
        // Raster filters serialize premultiplied channels between the axes.
        // Skia ScaledDividerU32: integer half and rounded 32-bit reciprocal.
        // A floating quotient differs at the one-count boundary on scaled inputs.
        let divide = |sum: f64| {
            let divisor = self.divisor as u64;
            if divisor == 1 {
                return sum.round() as f32;
            }
            let factor = (4294967296. / self.divisor).round() as u64;
            (((sum.round() as u64 + ((divisor + 1) >> 1)) * factor) >> 32) as f32
        };
        b[cursor] = [
            divide(sum[0]),
            divide(sum[1]),
            divide(sum[2]),
            divide(sum[3] * 255.) / 255.,
        ];
    }
}
