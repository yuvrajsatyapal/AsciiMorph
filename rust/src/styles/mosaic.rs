//! Rounded square, wide and tall tiles with sparse base-cell sampling.
use super::{
    contract::{Family, StyleSettings},
    pixel::TileJob,
    StyleFrame,
};
use crate::{
    character::{JobStatus, RenderError},
    source::SourceImage,
};
#[path = "mosaic_raster.rs"]
mod raster;
#[derive(Debug)]
pub struct MosaicJob {
    pub(crate) tiles: TileJob,
}

#[derive(Debug)]
pub(crate) struct SparseTile {
    x0: usize,
    x: usize,
    y: usize,
    x1: usize,
    y1: usize,
    stride: usize,
    count: usize,
    sum: [f64; 3],
}
impl SparseTile {
    pub fn new(bounds: [f64; 4], scale: f64) -> Self {
        let [x0, y0, x1, y1] = bounds.map(|v| (v / scale).floor() as usize);
        Self {
            x0,
            x: x0,
            y: y0,
            x1,
            y1,
            stride: ((x1 - x0) / 3).max(1),
            count: 0,
            sum: [0.; 3],
        }
    }
    /// One source tap per cooperative work unit. Tone is clamped before averaging.
    pub fn step(
        &mut self,
        source: &SourceImage,
        geometry: &super::geometry::FrameGeometry,
        settings: &StyleSettings,
    ) -> bool {
        if self.x < self.x1 && self.y < self.y1 {
            let p = geometry.pixel(source, settings.rotation, self.x, self.y);
            let k = 259. * (settings.contrast + 255.) / (255. * (259. - settings.contrast));
            for (sum, channel) in self.sum.iter_mut().zip(&p[..3]) {
                let value = if p[3] == 0 { 0. } else { *channel as f64 };
                *sum +=
                    (k * (value - 128.) + 128. + 255. * settings.brightness / 100.).clamp(0., 255.);
            }
            self.count += 1;
            self.x += self.stride;
            if self.x >= self.x1 {
                self.x = self.x0;
                self.y += self.stride;
            }
        }
        self.x >= self.x1 || self.y >= self.y1
    }
    pub fn rgb(&self) -> [f64; 3] {
        if self.count == 0 {
            [0.; 3]
        } else {
            self.sum.map(|v| v / self.count as f64)
        }
    }
}

/// Rasterize the rounded path with the same fixed-point coverage rules as Canvas.
pub(crate) fn rounded_coverage(
    bounds: [f64; 4],
    radius: f64,
    x: usize,
    y: usize,
    clip: [usize; 2],
) -> f64 {
    raster::coverage(bounds, radius, x, y, clip)
}
impl MosaicJob {
    pub fn new(source: &SourceImage, s: StyleSettings, other: usize) -> Result<Self, RenderError> {
        if !matches!(s.family, Family::Mosaic { .. }) {
            return Err(RenderError::InvalidInput);
        }
        Ok(Self {
            tiles: TileJob::new(source, s, other)?,
        })
    }
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        s: &StyleSettings,
        other: usize,
    ) -> Result<usize, RenderError> {
        if !matches!(s.family, Family::Mosaic { .. }) {
            return Err(RenderError::InvalidInput);
        }
        TileJob::peak(source, s, other)
    }
    pub fn step(&mut self, source: &SourceImage, max_work: u32) -> Result<JobStatus, RenderError> {
        self.tiles.step(source, max_work)
    }
    pub fn status(&self) -> JobStatus {
        self.tiles.status()
    }
    pub fn storage_bytes(&self) -> usize {
        self.tiles.storage_bytes()
    }
    pub fn cancel(&mut self) {
        self.tiles.cancel()
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        self.tiles.take_frame()
    }
}

#[cfg(test)]
mod tests {
    use super::rounded_coverage;

    #[test]
    fn scaled_wide_corner_matches_canvas() {
        assert_eq!(
            (255. * rounded_coverage([1., 1., 38.6, 32.], 6.6, 37, 3, [256, 128])).round() as u8,
            17
        );
    }

    #[test]
    fn clipped_tiles_use_canvas_clipping_blitter() {
        assert_eq!(
            (255. * rounded_coverage([241., 1., 287., 79.], 9.6, 245, 2, [256, 128])).round() as u8,
            80
        );
    }

    #[test]
    fn scaled_tiles_match_all_independent_canvas_masks() {
        let expected =
            include_bytes!("../../../tests/fixtures/render/styles/mosaic-scaled-canvas.alpha");
        let mut case = 0;
        let mut failures = vec![];
        for font in [3., 4., 5., 11., 40., 80.] {
            for scale in [1., 2., 3., 4.] {
                for (mx, my) in [(1, 1), (2, 1), (1, 2)] {
                    let (px, py) = (3. * font * scale / 5., font * scale);
                    let mut actual = vec![0u8; 256 * 128];
                    for row in (0..(128_f64 / py).ceil() as usize).step_by(my) {
                        for col in (0..(256_f64 / px).ceil() as usize).step_by(mx) {
                            let full = [
                                col as f64 * px,
                                row as f64 * py,
                                (col + mx) as f64 * px,
                                (row + my) as f64 * py,
                            ];
                            let mut b = [full[0] + 1., full[1] + 1., full[2] - 1., full[3] - 1.];
                            if b[0] > b[2] {
                                b.swap(0, 2);
                            }
                            if b[1] > b[3] {
                                b.swap(1, 3);
                            }
                            let radius = 0.2 * (full[2] - full[0]).min(full[3] - full[1]);
                            for y in (b[1].floor() - 1.).max(0.) as usize
                                ..(b[3].ceil() as usize + 1).min(128)
                            {
                                for x in (b[0].floor() - 1.).max(0.) as usize
                                    ..(b[2].ceil() as usize + 1).min(256)
                                {
                                    let a = (255. * rounded_coverage(b, radius, x, y, [256, 128]))
                                        .round() as u8;
                                    actual[y * 256 + x] = a.saturating_add(
                                        ((actual[y * 256 + x] as u32 * (255 - a) as u32 + 127)
                                            / 255) as u8,
                                    );
                                }
                            }
                        }
                    }
                    let oracle = &expected[case * 256 * 128..(case + 1) * 256 * 128];
                    if let Some(i) = actual.iter().zip(oracle).position(|(a, b)| a != b) {
                        failures.push((
                            font,
                            scale,
                            mx,
                            my,
                            i % 256,
                            i / 256,
                            actual[i],
                            oracle[i],
                        ));
                    }
                    case += 1;
                }
            }
        }
        assert_eq!(case, 72);
        assert!(
            failures.is_empty(),
            "{} cases differ: {failures:?}",
            failures.len()
        );
    }

    #[test]
    fn large_tiles_match_canvas_rle_and_direct_pair_blitters() {
        let b = [1., 1., 38.6, 32.];
        assert_eq!(
            (255. * rounded_coverage(b, 6.6, 35, 1, [256, 128])).round() as u8,
            0
        );
        assert_eq!(
            (255. * rounded_coverage(b, 6.6, 36, 2, [256, 128])).round() as u8,
            33
        );
    }

    #[test]
    fn conic_subdivision_preserves_canvas_float_operation_order() {
        assert_eq!(
            (255. * rounded_coverage([25., 1., 47., 39.], 4.8, 46, 4, [256, 128])).round() as u8,
            184
        );
    }

    #[test]
    fn skipped_flat_quadratic_steps_keep_the_original_snapped_origin() {
        // Independently measured with ctx.roundRect(1,1,0.4,2,0.48), white fill.
        assert_eq!(
            (255. * rounded_coverage([1., 1., 1.4, 3.], 0.48, 1, 1, [10, 10])).round() as u8,
            120
        );
        assert_eq!(
            (255. * rounded_coverage([1., 1., 1.4, 3.], 0.48, 1, 2, [10, 10])).round() as u8,
            96
        );
    }

    #[test]
    fn rounded_tiles_match_independent_canvas_alpha_masks() {
        for (mx, my, expected) in [
            (
                1,
                1,
                &include_bytes!("../../../tests/fixtures/render/styles/mosaic-square-canvas.alpha")
                    [..],
            ),
            (
                2,
                1,
                &include_bytes!("../../../tests/fixtures/render/styles/mosaic-wide-canvas.alpha")[..],
            ),
            (
                1,
                2,
                &include_bytes!("../../../tests/fixtures/render/styles/mosaic-tall-canvas.alpha")[..],
            ),
        ] {
            let mut actual = vec![0u8; 128 * 64];
            for row in (0..6).step_by(my) {
                for col in (0..20).step_by(mx) {
                    let left = col as f64 * 6.6 + 1.;
                    let top = row as f64 * 11. + 1.;
                    let w = 6.6 * mx as f64;
                    let h = 11. * my as f64;
                    let bounds = [left, top, left + w - 2., top + h - 2.];
                    for y in (top.floor() as usize)..(bounds[3].ceil() as usize).min(64) {
                        for x in (left.floor() as usize)..(bounds[2].ceil() as usize).min(128) {
                            actual[y * 128 + x] = (255.
                                * rounded_coverage(bounds, 0.2 * w.min(h), x, y, [128, 64]))
                            .round() as u8;
                        }
                    }
                }
            }
            let mismatches = actual.iter().zip(expected).filter(|(a, b)| a != b).count();
            assert_eq!(
                mismatches,
                0,
                "{mx}x{my}: first mismatch {:?}",
                actual
                    .iter()
                    .zip(expected)
                    .position(|(a, b)| a != b)
                    .map(|i| (i % 128, i / 128, actual[i], expected[i]))
            );
        }
    }
}
