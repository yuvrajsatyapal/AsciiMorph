//! Cooperative Image-source mip/bilinear sampling. Numerical rules follow Skia's
//! RGBA8 mip reductions and four-bit bitmap filter (BSD, third-party/skia-LICENSE).
//! A work unit reads one base pixel; the fixed stack retains no source allocation.
use super::{geometry::FrameGeometry, sampling::AreaSample};
use crate::{
    character::{JobStatus, RenderError},
    source::SourceImage,
};
#[derive(Debug, Clone, Copy, Default)]
struct Node {
    x: usize,
    y: usize,
    level: usize,
    child: usize,
    sum: [u32; 4],
}
#[derive(Debug)]
pub struct ImageSampler {
    width: usize,
    height: usize,
    level: usize,
    taps: [[usize; 2]; 4],
    weights: [u32; 4],
    tap: usize,
    stack: [Node; 6],
    depth: usize,
    sum: [u32; 4],
}
impl ImageSampler {
    pub fn new(
        g: &FrameGeometry,
        cols: usize,
        rows: usize,
        x: usize,
        y: usize,
    ) -> Result<Self, RenderError> {
        let (width, height) = g.extent();
        if cols == 0 || rows == 0 || x >= cols || y >= rows {
            return Err(RenderError::InvalidInput);
        }
        let shrink = (width as f64 / cols as f64)
            .max(height as f64 / rows as f64)
            .max(1.);
        let level = (shrink.log2().floor() as usize).min(width.max(height).ilog2() as usize);
        if level >= 6 {
            return Err(RenderError::InvalidInput);
        }
        let (w, h) = ((width >> level).max(1), (height >> level).max(1));
        let sx = (w as f64 / cols as f64) as f32 as f64;
        let sy = (h as f64 / rows as f64) as f32 as f64;
        let xx = (x as f64 + 0.5) * sx - 0.5;
        let yy = (y as f64 + 0.5) * sy - 0.5;
        let ix = xx.floor();
        let iy = yy.floor();
        let fx = ((xx - ix) * 16.).floor() as u32;
        let fy = ((yy - iy) * 16.).floor() as u32;
        let taps = std::array::from_fn(|i| {
            [
                (ix + (i % 2) as f64).clamp(0., (w - 1) as f64) as usize,
                (iy + (i / 2) as f64).clamp(0., (h - 1) as f64) as usize,
            ]
        });
        Ok(Self {
            width,
            height,
            level,
            taps,
            weights: [
                (16 - fx) * (16 - fy),
                fx * (16 - fy),
                (16 - fx) * fy,
                fx * fy,
            ],
            tap: 0,
            stack: [Node::default(); 6],
            depth: 0,
            sum: [0; 4],
        })
    }
    fn axis(n: usize) -> (&'static [u32], u32) {
        if n == 1 {
            (&[1], 1)
        } else if n % 2 == 0 {
            (&[1, 1], 2)
        } else {
            (&[1, 2, 1], 4)
        }
    }
    fn child(&self, n: Node, i: usize) -> (usize, usize, u32, usize, u32) {
        let w = (self.width >> (n.level - 1)).max(1);
        let h = (self.height >> (n.level - 1)).max(1);
        let (wx, dx) = Self::axis(w);
        let (wy, dy) = Self::axis(h);
        (
            if w == 1 { 0 } else { n.x * 2 + i % wx.len() },
            if h == 1 { 0 } else { n.y * 2 + i / wx.len() },
            wx[i % wx.len()] * wy[i / wx.len()],
            wx.len() * wy.len(),
            dx * dy,
        )
    }
    pub fn step(
        &mut self,
        source: &SourceImage,
        g: &FrameGeometry,
        rotation: u32,
        work: u32,
    ) -> Result<JobStatus, RenderError> {
        for _ in 0..work {
            if self.tap == 4 {
                break;
            }
            if self.depth == 0 {
                let [x, y] = self.taps[self.tap];
                self.stack[0] = Node {
                    x,
                    y,
                    level: self.level,
                    ..Default::default()
                };
                self.depth = 1;
            }
            while self.stack[self.depth - 1].level > 0 {
                let n = self.stack[self.depth - 1];
                let (x, y, _, _, _) = self.child(n, n.child);
                self.stack[self.depth - 1].child += 1;
                self.stack[self.depth] = Node {
                    x,
                    y,
                    level: n.level - 1,
                    ..Default::default()
                };
                self.depth += 1;
            }
            let n = self.stack[self.depth - 1];
            let p = g.pixel(source, rotation, n.x, n.y);
            let mut value = std::array::from_fn(|k| {
                if k == 3 {
                    p[3] as u32
                } else {
                    (p[k] as u32 * p[3] as u32 + 127) / 255
                }
            });
            loop {
                self.depth -= 1;
                if self.depth == 0 {
                    for (sum, v) in self.sum.iter_mut().zip(value) {
                        *sum += v * self.weights[self.tap];
                    }
                    self.tap += 1;
                    break;
                }
                let parent = self.stack[self.depth - 1];
                let (_, _, weight, count, divisor) = self.child(parent, parent.child - 1);
                for (sum, v) in self.stack[self.depth - 1].sum.iter_mut().zip(value) {
                    *sum += v * weight;
                }
                if parent.child < count {
                    break;
                }
                value = self.stack[self.depth - 1].sum.map(|v| v / divisor);
            }
        }
        Ok(if self.tap == 4 {
            JobStatus::Complete
        } else {
            JobStatus::Pending
        })
    }
    pub fn sample(&self) -> AreaSample {
        let p = self.sum.map(|v| v >> 8);
        let alpha = p[3];
        AreaSample {
            rgb: std::array::from_fn(|k| {
                if alpha == 0 {
                    0.
                } else {
                    {
                        let norm = 1.0f32 / 255.;
                        let reciprocal = 1.0 / (alpha as f32 * norm);
                        ((p[k] as f32 * norm * reciprocal * 255.)
                            .round_ties_even()
                            .min(255.)) as f64
                    }
                }
            }),
            alpha: alpha as f64,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_png_image_full_sample_frames_are_exact() {
        let rgba: Vec<u8> = (0..64)
            .flat_map(|y| {
                (0..128).flat_map(move |x| {
                    [2 * x, 4 * y, 255 - 2 * x, if x < 13 { 0 } else { 255 }].map(|v| v as u8)
                })
            })
            .collect();
        let source = SourceImage::new(128, 64, rgba, crate::character::MAX_SOURCE_BYTES).unwrap();
        for (size, cols, rows, expected) in [
            (
                1,
                128,
                64,
                include_bytes!("../../../tests/fixtures/render/dither/image-sample-1.rgba")
                    .as_slice(),
            ),
            (
                2,
                64,
                32,
                include_bytes!("../../../tests/fixtures/render/dither/image-sample-2.rgba")
                    .as_slice(),
            ),
            (
                3,
                43,
                21,
                include_bytes!("../../../tests/fixtures/render/dither/image-sample-3.rgba")
                    .as_slice(),
            ),
            (
                12,
                11,
                5,
                include_bytes!("../../../tests/fixtures/render/dither/image-sample-12.rgba")
                    .as_slice(),
            ),
        ] {
            assert_samples(&source, size, cols, rows, expected);
        }
    }
    fn assert_samples(
        source: &SourceImage,
        size: usize,
        cols: usize,
        rows: usize,
        expected: &[u8],
    ) {
        let settings = super::super::dither::tests::settings(
            source.width(),
            source.height(),
            super::super::dither::tests::d(),
        );
        let g = FrameGeometry::new(source, &settings).unwrap();
        let mut out = Vec::new();
        for y in 0..rows {
            for x in 0..cols {
                let mut sample = ImageSampler::new(&g, cols, rows, x, y).unwrap();
                assert_eq!(sample.step(source, &g, 0, 0).unwrap(), JobStatus::Pending);
                while sample.step(source, &g, 0, 1).unwrap() != JobStatus::Complete {}
                let sample = sample.sample();
                out.extend(sample.rgb.map(|v| v.round() as u8));
                out.push(sample.alpha.round() as u8);
            }
        }
        let mismatch = out.iter().zip(expected).position(|(a, b)| a != b);
        assert_eq!(
            mismatch,
            None,
            "pixelSize {size}, actual {:?}, expected {:?}",
            mismatch.map(|i| out[i]),
            mismatch.map(|i| expected[i])
        );
    }
    #[test]
    fn independent_odd_png_partial_alpha_samples_are_exact() {
        let rgba: Vec<u8> = (0..19)
            .flat_map(|y| {
                (0..31).flat_map(move |x| {
                    [
                        (x * 29 + y * 17) % 256,
                        (x * 11 + y * 37) % 256,
                        (x * 47 + y * 7) % 256,
                        (x * 13 + y * 31) % 256,
                    ]
                    .map(|v| v as u8)
                })
            })
            .collect();
        let source = SourceImage::new(31, 19, rgba, crate::character::MAX_SOURCE_BYTES).unwrap();
        for (size, cols, rows, expected) in [
            (
                1,
                31,
                19,
                include_bytes!("../../../tests/fixtures/render/dither/image-odd31-sample-1.rgba")
                    .as_slice(),
            ),
            (
                2,
                16,
                10,
                include_bytes!("../../../tests/fixtures/render/dither/image-odd31-sample-2.rgba")
                    .as_slice(),
            ),
            (
                3,
                10,
                6,
                include_bytes!("../../../tests/fixtures/render/dither/image-odd31-sample-3.rgba")
                    .as_slice(),
            ),
            (
                12,
                3,
                2,
                include_bytes!("../../../tests/fixtures/render/dither/image-odd31-sample-12.rgba")
                    .as_slice(),
            ),
        ] {
            assert_samples(&source, size, cols, rows, expected);
        }
    }
}
