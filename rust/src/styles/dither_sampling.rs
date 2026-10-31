//! Cooperative Image-source mip/bilinear sampling. Numerical rules follow Skia's
//! RGBA8 mip reductions and four-bit bitmap filter (BSD, third-party/skia-LICENSE).
//! A work unit reads one base pixel; the fixed stack retains no source allocation.
use super::{geometry::FrameGeometry, sampling::AreaSample};
use crate::character::{JobStatus, RenderError};
#[cfg(test)]
use crate::source::SourceImage;
#[derive(Debug, Clone, Copy, Default)]
struct Node {
    x: usize,
    y: usize,
    level: usize,
    child: usize,
    pixels: [[u32; 4]; 4],
}
#[derive(Debug)]
pub struct ImageSampler {
    width: usize,
    height: usize,
    level: usize,
    taps: [[usize; 2]; 4],
    weights: [u32; 4],
    tap: usize,
    stack: [Node; 8],
    depth: usize,
    sum: [u32; 4],
    filtered: [[u32; 4]; 4],
    fractions: [i32; 2],
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
        Self::for_extent(width, height, cols, rows, x, y)
    }
    pub(crate) fn for_extent(
        width: usize,
        height: usize,
        cols: usize,
        rows: usize,
        x: usize,
        y: usize,
    ) -> Result<Self, RenderError> {
        if width == 0 || height == 0 || cols == 0 || rows == 0 || x >= cols || y >= rows {
            return Err(RenderError::InvalidInput);
        }
        let mut level = 0;
        let (mut w, mut h) = (width, height);
        while w > 1 || h > 1 {
            let (next_w, next_h) = (w.div_ceil(2), h.div_ceil(2));
            if next_w < cols || next_h < rows {
                break;
            }
            level += 1;
            if level >= 8 {
                return Err(RenderError::InvalidInput);
            }
            (w, h) = (next_w, next_h);
        }
        let sx = (w as f64 / cols as f64) as f32 as f64;
        let sy = (h as f64 / rows as f64) as f32 as f64;
        let qx = Self::fixed(x, sx as f32);
        let qy = Self::fixed(y, sy as f32);
        let resized_decode = (1..=level).any(|l| {
            let pw = width.div_ceil(1 << (l - 1));
            let ph = height.div_ceil(1 << (l - 1));
            pw % 2 != 0 || ph % 2 != 0
        });
        let (ix, iy, fx, fy) = if level == 0 || resized_decode {
            (
                (qx >> 16) as f64,
                (qy >> 16) as f64,
                ((qx & 65535) >> 12) as u32,
                ((qy & 65535) >> 12) as u32,
            )
        } else {
            let xx = (x as f64 + 0.5) * sx - 0.5;
            let yy = (y as f64 + 0.5) * sy - 0.5;
            (
                xx.floor(),
                yy.floor(),
                ((xx - xx.floor()) * 16.).floor() as u32,
                ((yy - yy.floor()) * 16.).floor() as u32,
            )
        };
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
            stack: [Node::default(); 8],
            depth: 0,
            sum: [0; 4],
            filtered: [[0; 4]; 4],
            fractions: [(qx & 65535) - 32768, (qy & 65535) - 32768],
        })
    }
    fn extent_at(&self, level: usize) -> (usize, usize) {
        (
            self.width.div_ceil(1 << level),
            self.height.div_ceil(1 << level),
        )
    }
    fn fixed(position: usize, scale: f32) -> i32 {
        (65536.0f32 * ((position as f32 + 0.5) * scale) + 0.5).floor() as i32 - 32768
    }
    fn child(&self, n: Node, i: usize) -> (usize, usize) {
        let (w, h) = self.extent_at(n.level - 1);
        let (dw, dh) = self.extent_at(n.level);
        if w == 2 * dw && h == 2 * dh {
            return (n.x * 2 + i % 2, n.y * 2 + i / 2);
        }
        let qx = Self::fixed(n.x, w as f32 / dw as f32);
        let qy = Self::fixed(n.y, h as f32 / dh as f32);
        (
            ((qx >> 16) + (i % 2) as i32).clamp(0, w as i32 - 1) as usize,
            ((qy >> 16) + (i / 2) as i32).clamp(0, h as i32 - 1) as usize,
        )
    }
    fn bilerp(pixels: [[u32; 4]; 4], tx: i32, ty: i32) -> [u32; 4] {
        let multiply = |a: i32, b: i32| (a * b + 16384) >> 15;
        std::array::from_fn(|k| {
            let horizontal = |left: u32, right: u32| {
                let (left, right) = (left as i32, right as i32);
                (multiply(tx, (right - left) * 128) + (right + left) * 128 + 1) >> 1
            };
            let top = horizontal(pixels[0][k], pixels[1][k]);
            let bottom = horizontal(pixels[2][k], pixels[3][k]);
            ((multiply(ty, bottom - top) + bottom + top + 128) >> 8) as u32
        })
    }
    fn reduce(&self, n: Node) -> [u32; 4] {
        let (w, h) = self.extent_at(n.level - 1);
        let (dw, dh) = self.extent_at(n.level);
        if w == 2 * dw && h == 2 * dh {
            return std::array::from_fn(|k| n.pixels.iter().map(|p| p[k]).sum::<u32>() >> 2);
        }
        let qx = Self::fixed(n.x, w as f32 / dw as f32);
        let qy = Self::fixed(n.y, h as f32 / dh as f32);
        Self::bilerp(n.pixels, (qx & 65535) - 32768, (qy & 65535) - 32768)
    }
    #[cfg(test)]
    pub fn step(
        &mut self,
        source: &SourceImage,
        g: &FrameGeometry,
        rotation: u32,
        work: u32,
    ) -> Result<JobStatus, RenderError> {
        self.step_pixels(work, |x, y| g.pixel(source, rotation, x, y))
    }
    pub(crate) fn step_pixels(
        &mut self,
        work: u32,
        pixel: impl Fn(usize, usize) -> [u8; 4],
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
                let (x, y) = self.child(n, n.child);
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
            let p = pixel(n.x, n.y);
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
                    self.filtered[self.tap] = value;
                    for (sum, v) in self.sum.iter_mut().zip(value) {
                        *sum += v * self.weights[self.tap];
                    }
                    self.tap += 1;
                    break;
                }
                let parent = self.stack[self.depth - 1];
                self.stack[self.depth - 1].pixels[parent.child - 1] = value;
                if parent.child < 4 {
                    break;
                }
                value = self.reduce(self.stack[self.depth - 1]);
            }
        }
        Ok(if self.tap == 4 {
            JobStatus::Complete
        } else {
            JobStatus::Pending
        })
    }
    pub fn sample(&self) -> AreaSample {
        let p = if self.level == 0 {
            Self::bilerp(self.filtered, self.fractions[0], self.fractions[1])
        } else {
            self.sum.map(|v| v >> 8)
        };
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
        assert_eq!(out.len(), expected.len());
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
