//! Fixed complete-context compositor for already painted family RGBA layers.
use super::{contract::StyleSettings, geometry::FrameGeometry, StyleFrame};
use crate::{
    character::{JobStatus, RenderError, MAX_SOURCE_BYTES},
    character_backdrop::{blur_pixel_into, resize_pixel_into, source_over},
    reference_characters::source_identity,
    source::SourceImage,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Resize,
    Blur,
    Composite,
    Done,
    Cancelled,
}
#[derive(Debug)]
pub struct FrameComposer {
    geometry: FrameGeometry,
    rotation: u16,
    scale: u8,
    identity: (usize, u32, u32, usize, usize),
    width: usize,
    height: usize,
    layer: Option<Vec<u8>>,
    frame: Option<StyleFrame>,
    a: Vec<[f32; 4]>,
    b: Vec<[f32; 4]>,
    phase: Phase,
    cursor: usize,
    pass: usize,
    sum: [f64; 4],
}
impl FrameComposer {
    pub fn estimated_peak_bytes(
        source: &SourceImage,
        settings: &StyleSettings,
        layer_capacity: usize,
        other: usize,
    ) -> Result<usize, RenderError> {
        FrameGeometry::new(source, settings)?;
        let pixels = (settings.width as usize)
            .checked_mul(settings.height as usize)
            .ok_or(RenderError::BudgetExceeded)?;
        let bytes = pixels.checked_mul(4).ok_or(RenderError::BudgetExceeded)?;
        if layer_capacity < bytes {
            return Err(RenderError::InvalidInput);
        }
        source
            .storage_bytes()
            .checked_add(std::mem::size_of::<SourceImage>())
            .and_then(|v| v.checked_add(other))
            .and_then(|v| v.checked_add(std::mem::size_of::<Self>()))
            .and_then(|v| v.checked_add(layer_capacity))
            .and_then(|v| v.checked_add(pixels.checked_mul(32)?))
            .and_then(|v| v.checked_add(bytes)) // future serialization copy
            .ok_or(RenderError::BudgetExceeded)
    }
    pub fn new(
        source: &SourceImage,
        settings: StyleSettings,
        layer: Vec<u8>,
        other: usize,
    ) -> Result<Self, RenderError> {
        let geometry = FrameGeometry::new(source, &settings)?;
        let n = settings.width as usize * settings.height as usize;
        if layer.len() != n * 4 {
            return Err(RenderError::InvalidInput);
        }
        let peak = Self::estimated_peak_bytes(source, &settings, layer.capacity(), other)?;
        if peak > source.budget().min(MAX_SOURCE_BYTES) {
            return Err(RenderError::BudgetExceeded);
        }
        let allocate = || -> Result<Vec<[f32; 4]>, RenderError> {
            let mut v = Vec::new();
            v.try_reserve_exact(n)
                .map_err(|_| RenderError::BudgetExceeded)?;
            v.resize(n, [0.; 4]);
            Ok(v)
        };
        let (a, b) = (allocate()?, allocate()?);
        let excess = (a.capacity() - n + b.capacity() - n)
            .checked_mul(16)
            .ok_or(RenderError::BudgetExceeded)?;
        if peak
            .checked_add(excess)
            .is_none_or(|v| v > source.budget().min(MAX_SOURCE_BYTES))
        {
            return Err(RenderError::BudgetExceeded);
        }
        Ok(Self {
            geometry,
            rotation: settings.rotation as u16,
            scale: settings.scale as u8,
            identity: source_identity(source),
            width: settings.width as usize,
            height: settings.height as usize,
            layer: Some(layer),
            frame: None,
            a,
            b,
            phase: Phase::Resize,
            cursor: 0,
            pass: 0,
            sum: [0.; 4],
        })
    }
    pub fn storage_bytes(&self) -> usize {
        self.a.capacity() * 16
            + self.b.capacity() * 16
            + self.layer.as_ref().map_or(0, Vec::capacity)
            + self.frame.as_ref().map_or(0, |f| f.rgba.capacity())
    }
    /// Family rasterizers may fill the moved layer before composition begins.
    pub(crate) fn layer_mut(&mut self) -> &mut [u8] {
        self.layer.as_mut().expect("uncomposed family layer")
    }
    /// Capacity above the exact layer and scratch sizes reserved by the estimator.
    pub(crate) fn capacity_excess_bytes(&self) -> usize {
        let pixels = self.width * self.height;
        self.layer
            .as_ref()
            .map_or(0, |v| v.capacity().saturating_sub(pixels * 4))
            + self.a.capacity().saturating_sub(pixels) * 16
            + self.b.capacity().saturating_sub(pixels) * 16
    }
    pub fn status(&self) -> JobStatus {
        match self.phase {
            Phase::Done => JobStatus::Complete,
            Phase::Cancelled => JobStatus::Cancelled,
            _ => JobStatus::Pending,
        }
    }
    pub fn cancel(&mut self) {
        self.layer = None;
        self.frame = None;
        self.a = Vec::new();
        self.b = Vec::new();
        self.phase = Phase::Cancelled;
    }
    pub fn take_frame(&mut self) -> Option<StyleFrame> {
        if self.phase == Phase::Done {
            self.frame.take()
        } else {
            None
        }
    }
    pub fn step(&mut self, source: &SourceImage, max_work: u32) -> Result<JobStatus, RenderError> {
        if self.status() != JobStatus::Pending {
            return Ok(self.status());
        }
        if max_work == 0 {
            return Ok(JobStatus::Pending);
        }
        if source_identity(source) != self.identity {
            self.cancel();
            return Err(RenderError::MissingSource);
        }
        for _ in 0..max_work {
            match self.phase {
                Phase::Resize => {
                    resize_pixel_into(
                        &mut self.a,
                        self.cursor,
                        source,
                        &self.geometry.inner,
                        self.rotation,
                        self.scale,
                    );
                    self.cursor += 1;
                    if self.cursor == self.a.len() {
                        self.cursor = 0;
                        self.phase = Phase::Blur;
                    }
                }
                Phase::Blur => {
                    blur_pixel_into(
                        &mut self.a,
                        &mut self.b,
                        self.width,
                        self.height,
                        self.scale,
                        self.pass,
                        self.cursor,
                        &mut self.sum,
                    );
                    self.cursor += 1;
                    if self.cursor == self.a.len() {
                        std::mem::swap(&mut self.a, &mut self.b);
                        self.cursor = 0;
                        self.pass += 1;
                        if self.pass == 6 {
                            self.b = Vec::new();
                            self.phase = Phase::Composite;
                        }
                    }
                }
                Phase::Composite => {
                    let p = &mut self.layer.as_mut().unwrap()[self.cursor * 4..self.cursor * 4 + 4];
                    source_over(p, self.a[self.cursor]);
                    self.cursor += 1;
                    if self.cursor == self.width * self.height {
                        self.a = Vec::new();
                        self.frame = Some(StyleFrame {
                            width: self.width as u32,
                            height: self.height as u32,
                            rgba: self.layer.take().unwrap(),
                        });
                        self.phase = Phase::Done;
                    }
                }
                Phase::Done | Phase::Cancelled => break,
            }
        }
        Ok(self.status())
    }
}
