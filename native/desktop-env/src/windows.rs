//! Win32 window list for fly ledges.
//!
//! EnumWindows → IsWindowVisible → DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)
//! falling back to GetWindowRect. Returns `{ id, x, y, width, height }` in screen
//! coordinates (Y down). Top edge becomes a walkable Ledge in TypeScript.
//!
//! XCap's Win32 path is the reference; we do not depend on xcap.
//!
//! environmentTempo (`get_thermal_factor`): CPU MhzLimit vs MaxMhz via
//! `CallNtPowerInformation(ProcessorInformation)`. Unlimited → 1.0; throttled
//! maps onto the macOS thermal range (1.15 / 1.35 / 1.5). Flies are ectotherms:
//! a hot, speed-limited machine is a fast fly.

#![allow(non_camel_case_types, non_snake_case, dead_code)]

use std::ffi::c_void;
use std::mem;
use std::ptr;

use crate::{DesktopWindow, Point};

type HWND = *mut c_void;
type BOOL = i32;
type LPARAM = isize;
type HRESULT = i32;

const TRUE: BOOL = 1;
const FALSE: BOOL = 0;
const GWL_EXSTYLE: i32 = -20;
const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
const DWMWA_EXTENDED_FRAME_BOUNDS: u32 = 9;
const DWMWA_CLOAKED: u32 = 14;
const PROCESSOR_INFORMATION: i32 = 11;
const S_OK: HRESULT = 0;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct POINT {
    x: i32,
    y: i32,
}

#[repr(C)]
struct LASTINPUTINFO {
    cb_size: u32,
    dw_time: u32,
}

#[repr(C)]
struct SYSTEM_INFO {
    w_processor_architecture: u16,
    w_reserved: u16,
    dw_page_size: u32,
    lp_minimum_application_address: *mut c_void,
    lp_maximum_application_address: *mut c_void,
    dw_active_processor_mask: usize,
    dw_number_of_processors: u32,
    dw_processor_type: u32,
    dw_allocation_granularity: u32,
    w_processor_level: u16,
    w_processor_revision: u16,
}

/// ULONG × 6. https://learn.microsoft.com/en-us/windows/win32/power/processor-power-information-str
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct PROCESSOR_POWER_INFORMATION {
    number: u32,
    max_mhz: u32,
    current_mhz: u32,
    mhz_limit: u32,
    max_idle_state: u32,
    current_idle_state: u32,
}

type WNDENUMPROC = Option<unsafe extern "system" fn(HWND, LPARAM) -> BOOL>;

#[link(name = "user32")]
extern "system" {
    fn EnumWindows(lpEnumFunc: WNDENUMPROC, lParam: LPARAM) -> BOOL;
    fn IsWindow(hWnd: HWND) -> BOOL;
    fn IsWindowVisible(hWnd: HWND) -> BOOL;
    fn IsIconic(hWnd: HWND) -> BOOL;
    fn GetWindowRect(hWnd: HWND, lpRect: *mut RECT) -> BOOL;
    fn GetCursorPos(lpPoint: *mut POINT) -> BOOL;
    fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> BOOL;
    fn GetWindowLongPtrW(hWnd: HWND, nIndex: i32) -> isize;
    fn GetClassNameW(hWnd: HWND, lpClassName: *mut u16, nMaxCount: i32) -> i32;
    fn GetWindowThreadProcessId(hWnd: HWND, lpdwProcessId: *mut u32) -> u32;
}

#[link(name = "dwmapi")]
extern "system" {
    fn DwmGetWindowAttribute(
        hwnd: HWND,
        dwAttribute: u32,
        pvAttribute: *mut c_void,
        cbAttribute: u32,
    ) -> HRESULT;
}

#[link(name = "kernel32")]
extern "system" {
    fn GetTickCount() -> u32;
    fn GetCurrentProcessId() -> u32;
    fn GetSystemInfo(lpSystemInfo: *mut SYSTEM_INFO);
}

#[link(name = "powrprof")]
extern "system" {
    fn CallNtPowerInformation(
        information_level: i32,
        input_buffer: *mut c_void,
        input_buffer_length: u32,
        output_buffer: *mut c_void,
        output_buffer_length: u32,
    ) -> i32;
}

struct EnumState {
    windows: Vec<DesktopWindow>,
    our_pid: u32,
}

pub fn get_windows() -> Vec<DesktopWindow> {
    let mut state = EnumState {
        windows: Vec::new(),
        our_pid: unsafe { GetCurrentProcessId() },
    };
    unsafe {
        EnumWindows(Some(enum_proc), &mut state as *mut EnumState as LPARAM);
    }
    state.windows
}

pub fn get_cursor() -> Point {
    let mut p = POINT { x: 0, y: 0 };
    unsafe {
        if GetCursorPos(&mut p) == FALSE {
            return Point { x: 0.0, y: 0.0 };
        }
    }
    Point {
        x: p.x as f64,
        y: p.y as f64,
    }
}

pub fn get_idle_seconds() -> f64 {
    let mut info = LASTINPUTINFO {
        cb_size: mem::size_of::<LASTINPUTINFO>() as u32,
        dw_time: 0,
    };
    unsafe {
        if GetLastInputInfo(&mut info) == FALSE {
            return 0.0;
        }
        let idle_ms = GetTickCount().wrapping_sub(info.dw_time);
        idle_ms as f64 / 1000.0
    }
}

/// Map CPU speed-limit onto macOS thermalTempo: 1.0 / 1.15 / 1.35 / 1.5.
pub fn get_thermal_factor() -> f64 {
    unsafe {
        let mut sys = mem::zeroed::<SYSTEM_INFO>();
        GetSystemInfo(&mut sys);
        let n = sys.dw_number_of_processors.max(1).min(256) as usize;
        let mut buf = vec![PROCESSOR_POWER_INFORMATION::default(); n];
        let bytes = (mem::size_of::<PROCESSOR_POWER_INFORMATION>() * n) as u32;
        let status = CallNtPowerInformation(
            PROCESSOR_INFORMATION,
            ptr::null_mut(),
            0,
            buf.as_mut_ptr() as *mut c_void,
            bytes,
        );
        if status != 0 {
            return 1.0;
        }
        let mut worst_ratio = 1.0_f64;
        for p in &buf {
            if p.max_mhz == 0 {
                continue;
            }
            let ratio = (p.mhz_limit as f64) / (p.max_mhz as f64);
            if ratio < worst_ratio {
                worst_ratio = ratio;
            }
        }
        map_speed_limit_ratio(worst_ratio)
    }
}

pub fn is_degraded() -> bool {
    false
}

pub fn backend() -> &'static str {
    "windows"
}

fn map_speed_limit_ratio(ratio: f64) -> f64 {
    // Unlimited (cool/nominal) → 1.0. Throttling means the package is hot.
    if ratio >= 0.99 {
        1.0
    } else if ratio >= 0.80 {
        1.15
    } else if ratio >= 0.50 {
        1.35
    } else {
        1.5
    }
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = &mut *(lparam as *mut EnumState);
    if let Some(win) = window_from_hwnd(hwnd, state.our_pid) {
        state.windows.push(win);
    }
    TRUE
}

fn window_from_hwnd(hwnd: HWND, our_pid: u32) -> Option<DesktopWindow> {
    unsafe {
        if hwnd.is_null() || IsWindow(hwnd) == FALSE || IsWindowVisible(hwnd) == FALSE {
            return None;
        }
        if IsIconic(hwnd) != FALSE {
            return None;
        }
        if is_cloaked(hwnd) {
            return None;
        }

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == our_pid {
            return None;
        }

        let class_name = class_name(hwnd);
        if class_name == "Progman" || class_name == "WorkerW" || class_name == "Button" {
            return None;
        }

        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        if ex & WS_EX_TOOLWINDOW != 0 && class_name != "Shell_TrayWnd" {
            return None;
        }

        let rect = window_bounds(hwnd)?;
        let width = (rect.right - rect.left) as f64;
        let height = (rect.bottom - rect.top) as f64;
        if width <= 0.0 || height <= 0.0 {
            return None;
        }

        Some(DesktopWindow {
            id: format!("{}", hwnd as usize),
            x: rect.left as f64,
            y: rect.top as f64,
            width,
            height,
        })
    }
}

fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked = 0u32;
    unsafe {
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            mem::size_of::<u32>() as u32,
        );
        if hr != S_OK {
            return false;
        }
    }
    cloaked != 0
}

fn window_bounds(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    unsafe {
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut c_void,
            mem::size_of::<RECT>() as u32,
        );
        if hr == S_OK {
            return Some(rect);
        }
        if GetWindowRect(hwnd, &mut rect) == FALSE {
            return None;
        }
    }
    Some(rect)
}

fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..n as usize])
}
