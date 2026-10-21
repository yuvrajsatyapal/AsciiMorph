//! Version-one WASM ABI. Handles never recycle; only session-owned stages are readable.
//! At most 16 live sessions per WASM instance; stale handles never recycle.
//! Errors: 1 invalid input, 2 version, 3 budget, 4 source, 5 calibration, 6 cancelled, 7 disposed.
use crate::{
    character::{JobStatus, RenderError},
    session::RenderSession,
};
use std::{cell::RefCell, collections::BTreeMap};
struct Entry {
    session: RenderSession,
    error: u32,
}
#[derive(Default)]
struct Registry {
    next: u32,
    sessions: BTreeMap<u32, Entry>,
}
thread_local! {static REGISTRY:RefCell<Registry>=RefCell::new(Registry{next:1,..Registry::default()});}
fn with(handle: u32, f: impl FnOnce(&mut RenderSession) -> Result<u32, RenderError>) -> u32 {
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        let Some(e) = r.sessions.get_mut(&handle) else {
            return 0;
        };
        match f(&mut e.session) {
            Ok(v) => {
                e.error = 0;
                v
            }
            Err(err) => {
                e.error = match err {
                    RenderError::InvalidInput => 1,
                    RenderError::UnsupportedVersion => 2,
                    RenderError::BudgetExceeded => 3,
                    RenderError::MissingSource => 4,
                    RenderError::MissingCalibration => 5,
                    RenderError::Cancelled => 6,
                    RenderError::Disposed => 7,
                };
                0
            }
        }
    })
}
#[no_mangle]
pub extern "C" fn render_abi_version() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn render_create(budget: u32) -> u32 {
    let Ok(session) = RenderSession::new(budget as usize) else {
        return 0;
    };
    REGISTRY.with(|r| {
        let mut r = r.borrow_mut();
        let h = r.next;
        if h == u32::MAX || r.sessions.len() >= 16 {
            return 0;
        }
        r.next += 1;
        r.sessions.insert(h, Entry { session, error: 0 });
        h
    })
}
#[no_mangle]
pub extern "C" fn render_drop(h: u32) -> u32 {
    REGISTRY.with(|r| r.borrow_mut().sessions.remove(&h).map_or(0, |_| 1))
}
#[no_mangle]
pub extern "C" fn render_stage(h: u32, len: u32) -> u32 {
    with(h, |s| s.stage(len as usize).map(|p| p as u32))
}
#[no_mangle]
pub extern "C" fn render_unstage(h: u32, ptr: u32) -> u32 {
    with(h, |s| s.unstage(ptr as usize).map(|_| 1))
}
#[no_mangle]
pub extern "C" fn render_upload(h: u32, kind: u32, ptr: u32, len: u32) -> u32 {
    with(h, |s| s.upload(kind, ptr as usize, len as usize).map(|_| 1))
}
#[no_mangle]
pub extern "C" fn render_begin(h: u32, ptr: u32, len: u32) -> u32 {
    with(h, |s| s.begin_staged(ptr as usize, len as usize))
}
#[no_mangle]
pub extern "C" fn render_step(h: u32, job: u32, work: u32) -> u32 {
    with(h, |s| {
        s.step(job, work).map(|v| match v {
            JobStatus::Pending => 1,
            JobStatus::Complete => 2,
            JobStatus::Cancelled => 3,
        })
    })
}
#[no_mangle]
pub extern "C" fn render_cancel(h: u32, job: u32) -> u32 {
    with(h, |s| s.cancel(job).map(|_| 3))
}
#[no_mangle]
pub extern "C" fn render_release(h: u32, job: u32) -> u32 {
    with(h, |s| s.release(job).map(|_| 1))
}
#[no_mangle]
pub extern "C" fn render_output_ptr(h: u32, job: u32) -> u32 {
    with(h, |s| s.output(job).map(|b| b.as_ptr() as u32))
}
#[no_mangle]
pub extern "C" fn render_output_len(h: u32, job: u32) -> u32 {
    with(h, |s| s.output(job).map(|b| b.len() as u32))
}
#[no_mangle]
pub extern "C" fn render_error(h: u32) -> u32 {
    REGISTRY.with(|r| r.borrow().sessions.get(&h).map_or(7, |e| e.error))
}
