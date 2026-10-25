//! Cooperative exact-area sampling. One step unit visits at most one source pixel.
use super::geometry::FrameGeometry;
use crate::{
    character::{JobStatus, RenderError},
    source::SourceImage,
};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AreaSample {
    pub rgb: [f64; 3],
    pub alpha: f64,
}
#[derive(Debug)]
pub struct AreaSampler {
    rect: [f64; 4],
    start_x: usize,
    end_x: usize,
    end_y: usize,
    x: usize,
    y: usize,
    area: f64,
    alpha_area: f64,
    rgb: [f64; 3],
    initialized: bool,
    done: bool,
}
impl AreaSampler {
    pub fn new(x0: f64, y0: f64, x1: f64, y1: f64) -> Result<Self, RenderError> {
        if ![x0, y0, x1, y1].iter().all(|v| v.is_finite()) || x1 <= x0 || y1 <= y0 {
            return Err(RenderError::InvalidInput);
        }
        Ok(Self {
            rect: [x0, y0, x1, y1],
            start_x: 0,
            end_x: 0,
            end_y: 0,
            x: 0,
            y: 0,
            area: 0.,
            alpha_area: 0.,
            rgb: [0.; 3],
            initialized: false,
            done: false,
        })
    }
    /// Explicit initialization avoids storing source ownership and permits repeated areas.
    pub fn begin(&mut self, geometry: &FrameGeometry) {
        self.area = 0.;
        self.alpha_area = 0.;
        self.rgb = [0.; 3];
        self.initialized = true;
        let (w, h) = geometry.extent();
        let [x0, y0, x1, y1] = self.rect;
        self.start_x = x0.floor().max(0.).min(w as f64) as usize;
        self.x = self.start_x;
        self.y = y0.floor().max(0.).min(h as f64) as usize;
        self.end_x = x1.ceil().max(0.).min(w as f64) as usize;
        self.end_y = y1.ceil().max(0.).min(h as f64) as usize;
        self.done = self.x >= self.end_x || self.y >= self.end_y;
    }
    pub fn step(
        &mut self,
        source: &SourceImage,
        geometry: &FrameGeometry,
        rotation: u32,
        max_work: u32,
    ) -> Result<JobStatus, RenderError> {
        if max_work == 0 {
            return Ok(if self.done {
                JobStatus::Complete
            } else {
                JobStatus::Pending
            });
        }
        if !self.initialized {
            self.begin(geometry);
        }
        for _ in 0..max_work {
            if self.done {
                break;
            }
            let [x0, y0, x1, y1] = self.rect;
            let ox = (x1.min(self.x as f64 + 1.) - x0.max(self.x as f64)).max(0.);
            let oy = (y1.min(self.y as f64 + 1.) - y0.max(self.y as f64)).max(0.);
            let a = ox * oy;
            if a > 0. {
                let p = geometry.pixel(source, rotation, self.x, self.y);
                let alpha = p[3] as f64 / 255.;
                self.area += a;
                self.alpha_area += a * alpha;
                for (sum, &channel) in self.rgb.iter_mut().zip(p[..3].iter()) {
                    *sum += a * alpha * channel as f64;
                }
            }
            self.x += 1;
            if self.x >= self.end_x {
                self.x = self.start_x;
                self.y += 1;
                if self.y >= self.end_y {
                    self.done = true;
                }
            }
        }
        Ok(if self.done {
            JobStatus::Complete
        } else {
            JobStatus::Pending
        })
    }
    pub fn sample(&self) -> AreaSample {
        AreaSample {
            rgb: if self.alpha_area > 0. {
                self.rgb.map(|v| v / self.alpha_area)
            } else {
                [0.; 3]
            },
            alpha: if self.area > 0. {
                255. * self.alpha_area / self.area
            } else {
                0.
            },
        }
    }
}
