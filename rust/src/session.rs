//! Safe ownership boundary: every input span is backed by this session's registered stage.
//! Vector capacities count against the configured budget. Fixed bookkeeping is separately
//! bounded to one staging span and two retained jobs per session (16 sessions per ABI).
use crate::{
    character::{
        CharacterJob, CharacterSettings, ColorMode, Crop, Dither, GlyphGrid, JobStatus, Mapping,
        RenderError, MAX_SOURCE_BYTES, MAX_SOURCE_DIMENSION,
    },
    character_backdrop::{CompleteCharactersJob, ReferenceCharactersFrame},
    glyph::{DirectionalIndices, GlyphCalibration},
    reference_characters::{ReferenceAtlas, ReferenceBackdrop, ReferenceCharactersSettings},
    source::SourceImage,
    styles::{
        contract::{Family, StyleSettings},
        wire::decode_style_settings,
        StyleFrame, StyleJob,
    },
};
use std::{collections::BTreeMap, sync::Arc};
type StylePeak =
    fn(&SourceImage, &StyleSettings, Option<&ReferenceAtlas>, usize) -> Result<usize, RenderError>;
type StyleNew = fn(
    &SourceImage,
    StyleSettings,
    Option<&ReferenceAtlas>,
    usize,
) -> Result<StyleJob, RenderError>;
enum NumericJob {
    Legacy(CharacterJob),
    Style {
        job: StyleJob,
        calibration: Option<Arc<GlyphCalibration>>,
        origin_x: f64,
        origin_y: f64,
        space: u16,
    },
    Reference {
        job: CompleteCharactersJob,
        calibration: Arc<GlyphCalibration>,
        origin_x: f64,
        origin_y: f64,
        space: u16,
    },
}
impl NumericJob {
    fn storage_bytes(&self) -> usize {
        match self {
            Self::Legacy(j) => j.storage_bytes(),
            Self::Style { job, .. } => job.storage_bytes() + std::mem::size_of::<StyleJob>(),
            Self::Reference { job, .. } => {
                job.storage_bytes() + std::mem::size_of::<CompleteCharactersJob>()
            }
        }
    }
}
struct RetainedJob {
    numeric: Option<NumericJob>,
    is_profile: bool,
    frame_columns: u32,
    frame_rows: u32,
    output: Vec<u8>,
    output_bytes: usize,
    uses_calibration: bool,
    reserved_bytes: usize,
}
pub struct RenderSession {
    budget: usize,
    source: Option<SourceImage>,
    calibration: Option<Arc<GlyphCalibration>>,
    stages: BTreeMap<usize, Vec<u8>>,
    jobs: BTreeMap<u32, RetainedJob>,
    next_job: u32,
}
impl RenderSession {
    pub fn new(budget: usize) -> Result<Self, RenderError> {
        if budget == 0 || budget > MAX_SOURCE_BYTES {
            return Err(RenderError::InvalidInput);
        }
        Ok(Self {
            budget,
            source: None,
            calibration: None,
            stages: BTreeMap::new(),
            jobs: BTreeMap::new(),
            next_job: 1,
        })
    }
    pub fn source(&self) -> Option<&SourceImage> {
        self.source.as_ref()
    }
    pub fn storage_bytes(&self) -> usize {
        self.source.as_ref().map_or(0, |s| s.storage_bytes())
            + self.calibration_bytes()
            + self.stages.values().map(|v| v.capacity()).sum::<usize>()
            + self
                .jobs
                .values()
                .map(|j| j.numeric.as_ref().map_or(0, |v| v.storage_bytes()) + j.output.capacity())
                .sum::<usize>()
    }
    // At most current plus two active captures. Count actual allocations once, never
    // Arc references; completed jobs no longer need a numeric dictionary.
    fn calibration_bytes(&self) -> usize {
        let mut seen = [0usize; 3];
        let mut count = 0;
        let mut masks_seen = [0usize; 3];
        let mut mask_count = 0;
        let mut bytes = 0;
        for c in self
            .calibration
            .iter()
            .chain(self.jobs.values().filter_map(|j| match j.numeric.as_ref() {
                Some(NumericJob::Reference { calibration, .. }) => Some(calibration),
                Some(NumericJob::Style { calibration, .. }) => calibration.as_ref(),
                _ => None,
            }))
        {
            let identity = Arc::as_ptr(c) as usize;
            if !seen[..count].contains(&identity) {
                seen[count] = identity;
                count += 1;
                bytes += c.coverage.capacity() * 4
                    + c.shapes.capacity() * 4
                    + std::mem::size_of::<GlyphCalibration>()
                    + 2 * std::mem::size_of::<usize>();
                let mask_identity = Arc::as_ptr(&c.masks) as usize;
                if !masks_seen[..mask_count].contains(&mask_identity) {
                    masks_seen[mask_count] = mask_identity;
                    mask_count += 1;
                    bytes += c.masks.capacity()
                        + std::mem::size_of::<Vec<u8>>()
                        + 2 * std::mem::size_of::<usize>();
                }
            }
        }
        bytes
    }
    // Active reservations include future allocations, not just today's live scratch.
    // A stage/upload/second job cannot borrow another job's eventual peak.
    fn admission_bytes(&self) -> usize {
        self.storage_bytes()
            + self
                .jobs
                .values()
                .map(|j| {
                    let actual =
                        j.numeric.as_ref().map_or(0, |v| v.storage_bytes()) + j.output.capacity();
                    j.reserved_bytes.saturating_sub(actual)
                })
                .sum::<usize>()
    }
    fn preflight(&self, extra: usize) -> Result<(), RenderError> {
        if self
            .admission_bytes()
            .checked_add(extra)
            .is_none_or(|n| n > self.budget)
        {
            Err(RenderError::BudgetExceeded)
        } else {
            Ok(())
        }
    }
    pub fn stage(&mut self, len: usize) -> Result<usize, RenderError> {
        if len == 0 || !self.stages.is_empty() {
            return Err(RenderError::InvalidInput);
        }
        self.preflight(len)?;
        let data = vec![0; len];
        self.preflight(data.capacity())?;
        let ptr = data.as_ptr() as usize;
        self.stages.insert(ptr, data);
        Ok(ptr)
    }
    pub fn stage_mut(&mut self, ptr: usize) -> Result<&mut [u8], RenderError> {
        self.stages
            .get_mut(&ptr)
            .map(|v| v.as_mut_slice())
            .ok_or(RenderError::InvalidInput)
    }
    pub fn unstage(&mut self, ptr: usize) -> Result<(), RenderError> {
        self.stages
            .remove(&ptr)
            .map(|_| ())
            .ok_or(RenderError::InvalidInput)
    }
    fn staged(&self, ptr: usize, len: usize) -> Result<&[u8], RenderError> {
        self.stages
            .get(&ptr)
            .filter(|b| b.len() == len)
            .map(|b| b.as_slice())
            .ok_or(RenderError::InvalidInput)
    }
    pub fn upload(&mut self, kind: u32, ptr: usize, len: usize) -> Result<(), RenderError> {
        let b = self.staged(ptr, len)?;
        if b.len() < 32 {
            return Err(RenderError::InvalidInput);
        }
        if u32_at(b, 0)? != 1 {
            return Err(RenderError::UnsupportedVersion);
        }
        if u32_at(b, 4)? != kind {
            return Err(RenderError::InvalidInput);
        }
        let w = u32_at(b, 8)?;
        let h = u32_at(b, 12)?;
        let count = u32_at(b, 16)?;
        let mw = u32_at(b, 20)?;
        let mh = u32_at(b, 24)?;
        let flags = u32_at(b, 28)?;
        match kind {
            1 => {
                let bytes = (w as usize)
                    .checked_mul(h as usize)
                    .and_then(|n| n.checked_mul(4))
                    .ok_or(RenderError::InvalidInput)?;
                if w == 0
                    || h == 0
                    || w > MAX_SOURCE_DIMENSION
                    || h > MAX_SOURCE_DIMENSION
                    || bytes > MAX_SOURCE_BYTES
                    || b.len() != 32 + bytes
                    || count != 0
                    || mw != 0
                    || mh != 0
                    || flags != 0
                {
                    return Err(RenderError::InvalidInput);
                }
                self.preflight(bytes)?;
                let replacement = SourceImage::new(w, h, b[32..].to_vec(), self.budget)?;
                self.preflight(replacement.storage_bytes())?;
                self.source = Some(replacement);
                self.jobs.clear();
            }
            2 => {
                if w != 0
                    || h != 0
                    || !(2..=256).contains(&count)
                    || mw == 0
                    || mh == 0
                    || mw > MAX_SOURCE_DIMENSION
                    || mh > MAX_SOURCE_DIMENSION
                    || flags & !1 != 0
                {
                    return Err(RenderError::InvalidInput);
                }
                let masks = (count as usize)
                    .checked_mul(mw as usize)
                    .and_then(|n| n.checked_mul(mh as usize))
                    .ok_or(RenderError::InvalidInput)?;
                if masks > MAX_SOURCE_BYTES {
                    return Err(RenderError::InvalidInput);
                }
                let start = align4(
                    32usize
                        .checked_add(masks)
                        .ok_or(RenderError::InvalidInput)?,
                );
                let end = start
                    .checked_add(count as usize * 40)
                    .ok_or(RenderError::InvalidInput)?;
                if b.len() != end + if flags == 1 { 16 } else { 0 } {
                    return Err(RenderError::InvalidInput);
                }
                self.preflight(
                    masks
                        + count as usize * 40
                        + std::mem::size_of::<GlyphCalibration>()
                        + 4 * std::mem::size_of::<usize>()
                        + std::mem::size_of::<Vec<u8>>(),
                )?;
                let read_floats = |offset: usize, n: usize| -> Result<Vec<f32>, RenderError> {
                    let mut values = Vec::with_capacity(n);
                    for i in 0..n {
                        values.push(f32::from_bits(u32_at(b, offset + i * 4)?));
                    }
                    Ok(values)
                };
                let mut replacement = GlyphCalibration::new(
                    count as u16,
                    mw as u16,
                    mh as u16,
                    b[32..32 + masks].to_vec(),
                    read_floats(start, count as usize)?,
                    read_floats(start + count as usize * 4, count as usize * 9)?,
                )?;
                if flags == 1 {
                    let index = |i: usize| -> Result<u16, RenderError> {
                        u16::try_from(u32_at(b, end + i * 4)?)
                            .map_err(|_| RenderError::InvalidInput)
                    };
                    replacement = replacement.with_directional_indices(DirectionalIndices {
                        vertical: index(0)?,
                        slash: index(1)?,
                        horizontal: index(2)?,
                        backslash: index(3)?,
                    })?;
                }
                self.preflight(
                    replacement.storage_bytes()
                        + std::mem::size_of::<GlyphCalibration>()
                        + 4 * std::mem::size_of::<usize>()
                        + std::mem::size_of::<Vec<u8>>(),
                )?;
                self.calibration = Some(Arc::new(replacement));
                self.jobs.retain(|_, j| j.is_profile || !j.uses_calibration);
            }
            _ => return Err(RenderError::InvalidInput),
        }
        Ok(())
    }
    pub fn begin_staged(&mut self, ptr: usize, len: usize) -> Result<u32, RenderError> {
        let s = decode_settings(self.staged(ptr, len)?)?;
        self.begin(s)
    }
    pub fn begin(&mut self, s: CharacterSettings) -> Result<u32, RenderError> {
        if self.jobs.len() >= 2 || self.next_job == u32::MAX {
            return Err(RenderError::InvalidInput);
        }
        let source = self.source.as_ref().ok_or(RenderError::MissingSource)?;
        let job_bytes = CharacterJob::required_storage_bytes(&s)?;
        let output_bytes = output_len(s.width as usize * s.height as usize);
        // Include the largest retained job's serialization so either job can finish next.
        let peak = output_bytes.max(
            self.jobs
                .values()
                .map(|j| j.output_bytes)
                .max()
                .unwrap_or(0),
        );
        self.preflight(
            job_bytes
                .checked_add(peak)
                .ok_or(RenderError::BudgetExceeded)?,
        )?;
        let uses_calibration = s.mapping == Mapping::Glyph;
        let job = CharacterJob::new(
            source,
            s,
            if uses_calibration {
                self.calibration.as_deref()
            } else {
                None
            },
        )?;
        self.preflight(
            job.storage_bytes()
                .checked_add(peak)
                .ok_or(RenderError::BudgetExceeded)?,
        )?;
        let id = self.next_job;
        self.next_job += 1;
        self.jobs.insert(
            id,
            RetainedJob {
                numeric: Some(NumericJob::Legacy(job)),
                is_profile: false,
                frame_columns: 0,
                frame_rows: 0,
                output: Vec::new(),
                output_bytes,
                uses_calibration,
                reserved_bytes: job_bytes + output_bytes,
            },
        );
        Ok(id)
    }
    pub fn begin_characters_staged(&mut self, ptr: usize, len: usize) -> Result<u32, RenderError> {
        let (settings, count, x, y, space) = decode_reference_settings(self.staged(ptr, len)?)?;
        if self.jobs.len() >= 2 || self.next_job == u32::MAX {
            return Err(RenderError::InvalidInput);
        }
        let source = self.source.as_ref().ok_or(RenderError::MissingSource)?;
        let calibration = self
            .calibration
            .as_ref()
            .ok_or(RenderError::MissingCalibration)?;
        if calibration.glyph_count() != count {
            return Err(RenderError::MissingCalibration);
        }
        let atlas = ReferenceAtlas::borrowed(calibration, x, y, space)?;
        // Borrowed masks are charged once through the retained calibration. All other
        // jobs, outputs and stages are included before any frame/grid allocation.
        let cols = (settings.frame_width as f64 / settings.cell_width()).floor() as usize;
        let rows = (settings.frame_height as f64 / settings.cell_height()).floor() as usize;
        let output_bytes = 32
            + settings.frame_width as usize * settings.frame_height as usize * 4
            + if cols * rows == 0 {
                0
            } else {
                output_len(cols * rows)
            };
        let other = self.admission_bytes() - source.storage_bytes() - calibration.masks.capacity();
        let peak = CompleteCharactersJob::estimated_peak_bytes(source, &settings, &atlas, other)?;
        if peak > self.budget {
            return Err(RenderError::BudgetExceeded);
        }
        let reserved_bytes = peak - self.admission_bytes();
        let job = CompleteCharactersJob::new(source, settings.clone(), &atlas, other)?;
        let reserved_bytes = reserved_bytes
            .checked_add(job.capacity_excess_bytes())
            .ok_or(RenderError::BudgetExceeded)?;
        self.preflight(reserved_bytes)?;
        let id = self.next_job;
        self.next_job += 1;
        self.jobs.insert(
            id,
            RetainedJob {
                numeric: Some(NumericJob::Reference {
                    job,
                    calibration: Arc::clone(calibration),
                    origin_x: x,
                    origin_y: y,
                    space,
                }),
                is_profile: true,
                frame_columns: cols as u32,
                frame_rows: rows as u32,
                output: Vec::new(),
                output_bytes,
                uses_calibration: true,
                reserved_bytes,
            },
        );
        Ok(id)
    }
    pub fn begin_style_staged(&mut self, ptr: usize, len: usize) -> Result<u32, RenderError> {
        self.begin_style_with(ptr, len, StyleJob::estimated_peak_bytes, StyleJob::new)
    }
    fn begin_style_with(
        &mut self,
        ptr: usize,
        len: usize,
        estimate: StylePeak,
        create: StyleNew,
    ) -> Result<u32, RenderError> {
        let settings = decode_style_settings(self.staged(ptr, len)?)?;
        if self.jobs.len() >= 2 || self.next_job == u32::MAX {
            return Err(RenderError::InvalidInput);
        }
        let source = self.source.as_ref().ok_or(RenderError::MissingSource)?;
        settings.validate_source(source.width(), source.height())?;
        let calibration = if matches!(settings.family, Family::Braille { .. }) {
            let c = self
                .calibration
                .as_ref()
                .ok_or(RenderError::MissingCalibration)?;
            if c.glyph_count() as u32 != settings.atlas_count {
                return Err(RenderError::MissingCalibration);
            }
            let stride = c.mask_width as usize * c.mask_height as usize;
            if c.masks[..stride].iter().any(|v| *v != 0)
                || !c.masks[255 * stride..256 * stride].iter().any(|v| *v != 0)
            {
                return Err(RenderError::InvalidInput);
            }
            Some(Arc::clone(c))
        } else {
            None
        };
        let atlas = calibration
            .as_ref()
            .map(|c| {
                ReferenceAtlas::borrowed(
                    c,
                    settings.atlas_origin_x,
                    settings.atlas_origin_y,
                    settings.space_index as u16,
                )
            })
            .transpose()?;
        let output_bytes = (settings.width as usize)
            .checked_mul(settings.height as usize)
            .and_then(|n| n.checked_mul(4))
            .and_then(|n| n.checked_add(16))
            .ok_or(RenderError::BudgetExceeded)?;
        let admission = self.admission_bytes();
        // Every current or captured calibration is already charged in `other`.
        let other = admission - source.storage_bytes();
        let peak = estimate(source, &settings, atlas.as_ref(), other)?;
        let mut reserved_bytes = peak
            .checked_sub(admission)
            .ok_or(RenderError::InvalidInput)?;
        self.preflight(reserved_bytes)?;
        let job = create(source, settings.clone(), atlas.as_ref(), other)?;
        reserved_bytes = reserved_bytes
            .checked_add(job.capacity_excess_bytes())
            .ok_or(RenderError::BudgetExceeded)?;
        let actual = job
            .storage_bytes()
            .checked_add(std::mem::size_of::<StyleJob>())
            .and_then(|n| n.checked_add(output_bytes))
            .ok_or(RenderError::BudgetExceeded)?;
        reserved_bytes = reserved_bytes.max(actual);
        self.preflight(reserved_bytes)?;
        let id = self.next_job;
        self.next_job += 1;
        self.jobs.insert(
            id,
            RetainedJob {
                numeric: Some(NumericJob::Style {
                    job,
                    calibration,
                    origin_x: settings.atlas_origin_x,
                    origin_y: settings.atlas_origin_y,
                    space: settings.space_index as u16,
                }),
                is_profile: true,
                frame_columns: 0,
                frame_rows: 0,
                output: Vec::new(),
                output_bytes,
                uses_calibration: atlas.is_some(),
                reserved_bytes,
            },
        );
        Ok(id)
    }
    pub fn step(&mut self, id: u32, work: u32) -> Result<JobStatus, RenderError> {
        let j = self.jobs.get_mut(&id).ok_or(RenderError::InvalidInput)?;
        let Some(job) = j.numeric.as_mut() else {
            return Ok(JobStatus::Complete);
        };
        let source = self.source.as_ref().ok_or(RenderError::MissingSource)?;
        let status = match job {
            NumericJob::Style {
                job,
                calibration,
                origin_x,
                origin_y,
                space,
            } => {
                let atlas = calibration
                    .as_ref()
                    .map(|c| ReferenceAtlas::borrowed(c, *origin_x, *origin_y, *space))
                    .transpose()?;
                job.step(source, atlas.as_ref(), work)?
            }
            NumericJob::Legacy(job) => job.step(
                source,
                if j.uses_calibration {
                    self.calibration.as_deref()
                } else {
                    None
                },
                work,
            )?,
            NumericJob::Reference {
                job,
                calibration,
                origin_x,
                origin_y,
                space,
            } => {
                let atlas = ReferenceAtlas::borrowed(calibration, *origin_x, *origin_y, *space)?;
                job.step(source, &atlas, work)?
            }
        };
        if status == JobStatus::Complete {
            let output_bytes = j.output_bytes;
            let actual = j.numeric.as_ref().map_or(0, |v| v.storage_bytes());
            let extra = actual
                .checked_add(output_bytes)
                .ok_or(RenderError::BudgetExceeded)?
                .saturating_sub(j.reserved_bytes);
            self.preflight(extra)?;
            let j = self.jobs.get_mut(&id).ok_or(RenderError::InvalidInput)?;
            j.output = match j.numeric.as_mut().ok_or(RenderError::InvalidInput)? {
                NumericJob::Style { job, .. } => {
                    serialize_style_frame(&job.take_frame().ok_or(RenderError::InvalidInput)?)?
                }
                NumericJob::Legacy(job) => {
                    serialize(&job.take_grid().ok_or(RenderError::InvalidInput)?)
                }
                NumericJob::Reference { job, .. } => serialize_frame(
                    &job.take_frame().ok_or(RenderError::InvalidInput)?,
                    j.frame_columns,
                    j.frame_rows,
                ),
            };
            j.numeric = None;
            j.reserved_bytes = j.output.capacity();
            // Final vec capacity is checked as well; a failed result is released
            // without borrowing another live job's reserved future peak.
            if self.preflight(0).is_err() {
                self.jobs.remove(&id);
                return Err(RenderError::BudgetExceeded);
            }
        }
        Ok(status)
    }
    pub fn output(&self, id: u32) -> Result<&[u8], RenderError> {
        self.jobs
            .get(&id)
            .filter(|j| j.numeric.is_none() && !j.is_profile)
            .map(|j| j.output.as_slice())
            .ok_or(RenderError::InvalidInput)
    }
    pub fn frame_output(&self, id: u32) -> Result<&[u8], RenderError> {
        self.jobs
            .get(&id)
            .filter(|j| j.numeric.is_none() && j.is_profile)
            .map(|j| j.output.as_slice())
            .ok_or(RenderError::InvalidInput)
    }
    pub fn release(&mut self, id: u32) -> Result<(), RenderError> {
        if self.jobs.get(&id).is_none_or(|j| j.numeric.is_some()) {
            return Err(RenderError::InvalidInput);
        }
        self.jobs.remove(&id);
        Ok(())
    }
    pub fn cancel(&mut self, id: u32) -> Result<(), RenderError> {
        if let Some(NumericJob::Style { job, .. }) =
            self.jobs.get_mut(&id).and_then(|j| j.numeric.as_mut())
        {
            job.cancel();
        }
        self.jobs
            .remove(&id)
            .map(|_| ())
            .ok_or(RenderError::InvalidInput)
    }
}
fn serialize_style_frame(frame: &StyleFrame) -> Result<Vec<u8>, RenderError> {
    let bytes = (frame.width as usize)
        .checked_mul(frame.height as usize)
        .and_then(|n| n.checked_mul(4))
        .ok_or(RenderError::InvalidInput)?;
    if bytes != frame.rgba.len() {
        return Err(RenderError::InvalidInput);
    }
    let length = bytes.checked_add(16).ok_or(RenderError::BudgetExceeded)?;
    let mut wire = vec![0; length];
    for (i, value) in [1, frame.width, frame.height, bytes as u32]
        .into_iter()
        .enumerate()
    {
        wire[i * 4..i * 4 + 4].copy_from_slice(&value.to_le_bytes());
    }
    wire[16..].copy_from_slice(&frame.rgba);
    Ok(wire)
}
fn align4(n: usize) -> usize {
    (n + 3) & !3
}
fn output_len(n: usize) -> usize {
    align4(32 + n * 2) + n * 12
}
fn serialize(g: &GlyphGrid) -> Vec<u8> {
    let n = g.glyph_indices.len();
    let fg = align4(32 + n * 2);
    let bg = fg + n * 4;
    let alpha = bg + n * 4;
    let mut b = vec![0; alpha + n * 4];
    write_grid(g, &mut b);
    b
}
fn write_grid(g: &GlyphGrid, b: &mut [u8]) {
    let n = g.glyph_indices.len();
    let fg = align4(32 + n * 2);
    let bg = fg + n * 4;
    let alpha = bg + n * 4;
    let total = b.len() as u32;
    for (i, v) in [
        1,
        g.width,
        g.height,
        32,
        fg as u32,
        bg as u32,
        alpha as u32,
        total,
    ]
    .iter()
    .enumerate()
    {
        b[i * 4..i * 4 + 4].copy_from_slice(&v.to_le_bytes())
    }
    for (i, v) in g.glyph_indices.iter().enumerate() {
        b[32 + i * 2..34 + i * 2].copy_from_slice(&v.to_le_bytes())
    }
    b[fg..bg].copy_from_slice(&g.foreground);
    b[bg..alpha].copy_from_slice(&g.background);
    for (i, v) in g.alpha.iter().enumerate() {
        b[alpha + i * 4..alpha + i * 4 + 4].copy_from_slice(&v.to_le_bytes())
    }
}
fn u32_at(b: &[u8], at: usize) -> Result<u32, RenderError> {
    let v = b.get(at..at + 4).ok_or(RenderError::InvalidInput)?;
    Ok(u32::from_le_bytes(
        v.try_into().map_err(|_| RenderError::InvalidInput)?,
    ))
}
pub fn decode_settings(b: &[u8]) -> Result<CharacterSettings, RenderError> {
    if b.len() != 160 {
        return Err(RenderError::InvalidInput);
    }
    if u32_at(b, 0)? != 1 {
        return Err(RenderError::UnsupportedVersion);
    }
    let flags = u32_at(b, 16)?;
    if flags & !15 != 0 {
        return Err(RenderError::InvalidInput);
    }
    let f = |i: usize| -> Result<f64, RenderError> {
        Ok(f64::from_le_bytes(
            b[32 + i * 8..40 + i * 8]
                .try_into()
                .map_err(|_| RenderError::InvalidInput)?,
        ))
    };
    let color = |v: f64| -> Result<u32, RenderError> {
        if v.is_finite() && (0. ..=0xffffff as f64).contains(&v) && v.fract() == 0. {
            Ok(v as u32)
        } else {
            Err(RenderError::InvalidInput)
        }
    };
    let bg = f(14)?;
    let s = CharacterSettings {
        version: 1,
        width: u32_at(b, 4)?,
        height: u32_at(b, 8)?,
        rotation: u16::try_from(u32_at(b, 12)?).map_err(|_| RenderError::InvalidInput)?,
        shape_aware: flags & 1 != 0,
        smart_edges: flags & 2 != 0,
        mapping_invert: flags & 4 != 0,
        output_invert: flags & 8 != 0,
        mode: match u32_at(b, 20)? {
            0 => ColorMode::Monochrome,
            1 => ColorMode::Grayscale,
            2 => ColorMode::Color,
            _ => return Err(RenderError::InvalidInput),
        },
        mapping: match u32_at(b, 24)? {
            0 => Mapping::Glyph,
            1 => Mapping::Braille,
            _ => return Err(RenderError::InvalidInput),
        },
        seed: u32_at(b, 28)?,
        cell_width: f(0)?,
        cell_height: f(1)?,
        crop: Crop {
            x: f(2)?,
            y: f(3)?,
            width: f(4)?,
            height: f(5)?,
        },
        brightness: f(6)?,
        contrast: f(7)?,
        gamma: f(8)?,
        saturation: f(9)?,
        density: f(10)?,
        sharpness: f(11)?,
        edge: f(12)?,
        fg: color(f(13)?)?,
        bg: if bg == -1. { None } else { Some(color(bg)?) },
        dither: match f(15)? {
            0. => Dither::None,
            1. => Dither::FloydSteinberg,
            _ => return Err(RenderError::InvalidInput),
        },
    };
    s.validate()?;
    Ok(s)
}

/// Profile v1 is a separate 112-byte block; no legacy flags are reinterpreted.
pub fn decode_reference_settings(
    b: &[u8],
) -> Result<(ReferenceCharactersSettings, u16, f64, f64, u16), RenderError> {
    if b.len() != 112 {
        return Err(RenderError::InvalidInput);
    }
    if u32_at(b, 0)? != 1 {
        return Err(RenderError::UnsupportedVersion);
    }
    let count = u32_at(b, 16)?;
    let space = u32_at(b, 28)?;
    if !(2..=256).contains(&count) || (space != 65535 && space >= count) || u32_at(b, 24)? != 0 {
        return Err(RenderError::InvalidInput);
    }
    let f = |i: usize| f64::from_le_bytes(b[32 + i * 8..40 + i * 8].try_into().unwrap());
    if (0..10).any(|i| !f(i).is_finite()) || f(1).fract() != 0. || !(1. ..=4.).contains(&f(1)) {
        return Err(RenderError::InvalidInput);
    }
    let settings = ReferenceCharactersSettings {
        version: 1,
        frame_width: u32_at(b, 4)?,
        frame_height: u32_at(b, 8)?,
        rotation: u16::try_from(u32_at(b, 12)?).map_err(|_| RenderError::InvalidInput)?,
        font_size: f(0),
        render_scale: f(1) as u8,
        brightness: f(2),
        contrast: f(3),
        crop: Crop {
            x: f(4),
            y: f(5),
            width: f(6),
            height: f(7),
        },
        backdrop: match u32_at(b, 20)? {
            0 => ReferenceBackdrop::None,
            1 => ReferenceBackdrop::Solid,
            2 => ReferenceBackdrop::Blur,
            _ => return Err(RenderError::InvalidInput),
        },
    };
    settings.validate()?;
    Ok((settings, count as u16, f(8), f(9), space as u16))
}
fn serialize_frame(f: &ReferenceCharactersFrame, cols: u32, rows: u32) -> Vec<u8> {
    let grid_len = f
        .grid
        .as_ref()
        .map_or(0, |g| output_len(g.glyph_indices.len()));
    let grid_offset = if grid_len > 0 { 32 + f.rgba.len() } else { 0 };
    let mut b = vec![0; 32 + f.rgba.len() + grid_len];
    let total = b.len() as u32;
    for (i, v) in [
        1,
        f.width,
        f.height,
        cols,
        rows,
        32,
        grid_offset as u32,
        total,
    ]
    .iter()
    .enumerate()
    {
        b[i * 4..i * 4 + 4].copy_from_slice(&v.to_le_bytes());
    }
    b[32..32 + f.rgba.len()].copy_from_slice(&f.rgba);
    if let Some(grid) = &f.grid {
        write_grid(grid, &mut b[grid_offset..]);
    }
    b
}

#[cfg(test)]
mod retention_tests {
    use super::*;
    fn calibration() -> Arc<GlyphCalibration> {
        let mut masks = Vec::with_capacity(67);
        masks.extend([0, 255]);
        let mut coverage = Vec::with_capacity(7);
        coverage.extend([0., 1.]);
        let mut shapes = Vec::with_capacity(31);
        shapes.extend([0.; 18]);
        Arc::new(GlyphCalibration::new(2, 1, 1, masks, coverage, shapes).unwrap())
    }
    fn begin(s: &mut RenderSession) -> u32 {
        let mut b = Vec::new();
        for value in [1u32, 5, 3, 0, 2, 0, 0, 65535] {
            b.extend(value.to_le_bytes());
        }
        for value in [3f64, 1., 0., 0., 0., 0., 1., 1., 0., 0.] {
            b.extend(value.to_le_bytes());
        }
        let p = s.stage(112).unwrap();
        s.stage_mut(p).unwrap().copy_from_slice(&b);
        let job = s.begin_characters_staged(p, 112).unwrap();
        s.unstage(p).unwrap();
        job
    }
    #[test]
    fn counts_unique_capacities_and_ownership_metadata_without_arc_multiplication() {
        let mut s = RenderSession::new(100000).unwrap();
        s.source = Some(SourceImage::new(5, 3, vec![255; 60], 100000).unwrap());
        let original = calibration();
        let metadata = std::mem::size_of::<GlyphCalibration>()
            + 4 * std::mem::size_of::<usize>()
            + std::mem::size_of::<Vec<u8>>();
        s.calibration = Some(Arc::clone(&original));
        let base = 67 + 7 * 4 + 31 * 4 + metadata;
        assert_eq!(s.calibration_bytes(), base);
        let first = begin(&mut s);
        let second = begin(&mut s);
        assert_eq!(s.calibration_bytes(), base);
        // A distinct calibration owns cloned vectors but shares the same mask Arc.
        let cloned = Arc::new(original.as_ref().clone());
        let cloned_vectors = cloned.coverage.capacity() * 4 + cloned.shapes.capacity() * 4;
        s.calibration = Some(cloned);
        let calibration_metadata =
            std::mem::size_of::<GlyphCalibration>() + 2 * std::mem::size_of::<usize>();
        assert_eq!(
            s.calibration_bytes(),
            base + cloned_vectors + calibration_metadata
        );
        s.cancel(first).unwrap();
        s.cancel(second).unwrap();
        assert_eq!(s.calibration_bytes(), 67 + cloned_vectors + metadata);
        // Equal values in a genuinely separate mask allocation must be charged again.
        let old = begin(&mut s);
        let distinct = calibration();
        s.calibration = Some(distinct);
        assert_eq!(s.calibration_bytes(), 67 + cloned_vectors + metadata + base);
        s.cancel(old).unwrap();
        assert_eq!(s.calibration_bytes(), base);
    }
    #[test]
    fn replacement_and_second_profile_preserve_all_old_future_reservations() {
        let mut s = RenderSession::new(100000).unwrap();
        s.source = Some(SourceImage::new(5, 3, vec![255; 60], 100000).unwrap());
        let old = calibration();
        s.calibration = Some(Arc::clone(&old));
        let id = begin(&mut s);
        // Wire replacement has two independent 8x8 masks plus coverage/shapes.
        let mut b = Vec::new();
        for v in [1u32, 2, 0, 0, 2, 8, 8, 0] {
            b.extend(v.to_le_bytes());
        }
        b.extend([0; 128]);
        for _ in 0..20 {
            b.extend(0f32.to_le_bytes());
        }
        let replacement_bytes = 128
            + 80
            + std::mem::size_of::<GlyphCalibration>()
            + 4 * std::mem::size_of::<usize>()
            + std::mem::size_of::<Vec<u8>>();
        s.budget = s.admission_bytes() + b.len() + replacement_bytes - 1;
        let p = s.stage(b.len()).unwrap();
        s.stage_mut(p).unwrap().copy_from_slice(&b);
        assert_eq!(s.upload(2, p, b.len()), Err(RenderError::BudgetExceeded));
        s.unstage(p).unwrap();
        assert!(Arc::ptr_eq(s.calibration.as_ref().unwrap(), &old));
        // A stage cannot consume even one byte of this active job's future peak.
        let free_actual = s.budget - s.storage_bytes();
        assert_eq!(s.stage(free_actual), Err(RenderError::BudgetExceeded));
        // Replacement can now be admitted, retaining the original job's dictionary.
        s.budget = 100000;
        let p = s.stage(b.len()).unwrap();
        s.stage_mut(p).unwrap().copy_from_slice(&b);
        s.upload(2, p, b.len()).unwrap();
        s.unstage(p).unwrap();
        let second_peak = s.admission_bytes();
        s.budget = second_peak + 112;
        let mut config = Vec::new();
        for v in [1u32, 5, 3, 0, 2, 0, 0, 65535] {
            config.extend(v.to_le_bytes());
        }
        for v in [3f64, 1., 0., 0., 0., 0., 1., 1., 0., 0.] {
            config.extend(v.to_le_bytes());
        }
        let p = s.stage(112).unwrap();
        s.stage_mut(p).unwrap().copy_from_slice(&config);
        assert_eq!(
            s.begin_characters_staged(p, 112),
            Err(RenderError::BudgetExceeded)
        );
        s.unstage(p).unwrap();
        while s.step(id, 1).unwrap() != JobStatus::Complete {}
        s.release(id).unwrap();
        assert_eq!(s.jobs.len(), 0);
    }
}

#[cfg(test)]
#[path = "styles/session_tests.rs"]
mod style_tests;
