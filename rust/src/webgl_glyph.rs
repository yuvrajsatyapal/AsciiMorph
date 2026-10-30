//! Software WebGL quad interpolation. Float plane arithmetic follows SwiftShader's
//! SetupRoutine::setupGradient and PixelRoutine interpolation (Apache-2.0).
//! https://github.com/google/swiftshader/blob/master/src/Pipeline/SetupRoutine.cpp
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct Triangle {
    origin: [f32; 2],
    planes: [[f32; 3]; 6],
}
impl Triangle {
    fn new(v: [[f32; 8]; 3]) -> Self {
        let x1 = v[1][0] - v[0][0];
        let y1 = v[1][1] - v[0][1];
        let x2 = v[2][0] - v[0][0];
        let y2 = v[2][1] - v[0][1];
        let inv = 1. / (x1 * y2 - x2 * y1);
        let m = [
            [(y1 - y2) * inv, (x2 - x1) * inv, 1.],
            [y2 * inv, -x2 * inv, 0.],
            [-y1 * inv, x1 * inv, 0.],
        ];
        Self {
            origin: [v[0][0], v[0][1]],
            planes: std::array::from_fn(|k| {
                std::array::from_fn(|j| {
                    (v[0][k + 2] * m[0][j] + v[1][k + 2] * m[1][j]) + v[2][k + 2] * m[2][j]
                })
            }),
        }
    }
    fn at(&self, x: f32, y: f32) -> [f32; 6] {
        self.planes
            .map(|p| (x - self.origin[0]).mul_add(p[0], p[2] + (y - self.origin[1]) * p[1]))
    }
}
#[derive(Debug)]
pub(crate) struct Batch {
    slots: [u16; 256],
    count: u16,
    pub slot: [usize; 2],
    pub size: [usize; 2],
    pub origin: [f32; 2],
    frame_height: f32,
    triangles: [Triangle; 2],
}
impl Batch {
    pub fn new(font: f64) -> Self {
        Self {
            slots: [65535; 256],
            count: 0,
            slot: [0; 2],
            size: [
                (1.1 * font).ceil() as usize + 4,
                (1.3 * font).ceil() as usize + 4,
            ],
            origin: [0.; 2],
            frame_height: 0.,
            triangles: [Triangle::default(); 2],
        }
    }
    pub fn select(&mut self, glyph: u16, cell: [f64; 2], frame: [u32; 2], color: [f32; 4]) {
        if self.slots[glyph as usize] == 65535 {
            self.slots[glyph as usize] = self.count;
            self.count += 1;
        }
        let slot = self.slots[glyph as usize] as usize;
        let columns = 2048 / self.size[0];
        self.slot = [slot % columns, slot / columns];
        // Float32 instance upload, vertex shader, then four-bit subpixel projection.
        let position = cell.map(|c| (c - 2.) as f32);
        let scale = [2f32 / frame[0] as f32, -2f32 / frame[1] as f32];
        let vertices: [[f32; 8]; 4] = std::array::from_fn(|i| {
            let corner = [(i % 2) as f32, (i / 2) as f32];
            let px: [f32; 2] =
                std::array::from_fn(|k| position[k] + corner[k] * self.size[k] as f32);
            let clip = [px[0] * scale[0] - 1., px[1] * scale[1] + 1.];
            let screen = [
                (clip[0] + 1.) * (frame[0] as f32 / 2.),
                (clip[1] + 1.) * (frame[1] as f32 / 2.),
            ];
            let projected = screen.map(|v| (v * 16.).round_ties_even() / 16.);
            let uv: [f32; 2] = std::array::from_fn(|k| {
                (self.slot[k] as f32 + corner[k]) * self.size[k] as f32 * (1f32 / 2048.)
            });
            [
                projected[0],
                projected[1],
                uv[0],
                uv[1],
                color[0],
                color[1],
                color[2],
                color[3],
            ]
        });
        self.frame_height = frame[1] as f32;
        self.origin = [vertices[0][0], self.frame_height - vertices[0][1]];
        self.triangles = [
            Triangle::new([vertices[2], vertices[0], vertices[1]]),
            Triangle::new([vertices[3], vertices[2], vertices[1]]),
        ];
    }
    pub fn at(&self, x: usize, y: usize) -> [f32; 6] {
        let px = x as f32 + 0.5;
        let py = y as f32 + 0.5;
        let triangle = usize::from(
            (px - self.origin[0]) / self.size[0] as f32
                + (py - self.origin[1]) / self.size[1] as f32
                > 1.,
        );
        self.triangles[triangle].at(px, self.frame_height - py)
    }
}
