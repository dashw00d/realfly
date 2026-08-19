//! Recreate upstream WindowSense (CGWindowList) behind DesktopEnvironment.
//!
//! Best-effort `CGWindowListCopyWindowInfo` (on-screen, exclude desktop
//! elements) — same call as `vendor/desktop-fly/Environment.swift` `WindowSense.poll`.
//! Returns screen coordinates (CG global, top-left origin, Y down). TypeScript
//! converts to scene/ledge space (Phase 5).
//!
//! thermalState → environmentTempo:
//!   nominal 1.0, fair 1.15, serious 1.35, critical 1.5
//! (Environment.swift `thermalTempo`).
//!
//! Idle: `CGEventSourceSecondsSinceLastEventType` on mouse/key/scroll
//! (permission-free; reveals when, never what).
//!
//! XCap's macOS path is the reference; we do not depend on xcap.

#![allow(non_camel_case_types, non_snake_case, dead_code)]

use std::ffi::c_void;
use std::ptr;

use crate::{DesktopWindow, Point};

type CFTypeRef = *const c_void;
type CFArrayRef = *const c_void;
type CFDictionaryRef = *const c_void;
type CFStringRef = *const c_void;
type CFNumberRef = *const c_void;
type CFAllocatorRef = *const c_void;
type CGWindowID = u32;
type CGWindowListOption = u32;
type CGEventRef = *mut c_void;
type CGEventSourceStateID = u32;
type CGEventType = u32;
type CFIndex = isize;
type Boolean = u8;
type CFNumberType = isize;
type CFStringEncoding = u32;

const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: CGWindowListOption = 1;
const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: CGWindowListOption = 1 << 4;
const K_CG_NULL_WINDOW_ID: CGWindowID = 0;
const K_CF_STRING_ENCODING_UTF8: CFStringEncoding = 0x0800_0100;
const K_CF_NUMBER_INT_TYPE: CFNumberType = 9;
const K_CF_NUMBER_DOUBLE_TYPE: CFNumberType = 13;
const K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION: CGEventSourceStateID = 0;
const K_CG_EVENT_LEFT_MOUSE_DOWN: CGEventType = 1;
const K_CG_EVENT_MOUSE_MOVED: CGEventType = 5;
const K_CG_EVENT_KEY_DOWN: CGEventType = 10;
const K_CG_EVENT_SCROLL_WHEEL: CGEventType = 22;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGSize {
    width: f64,
    height: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCopyWindowInfo(option: CGWindowListOption, relative_to: CGWindowID) -> CFArrayRef;
    fn CGRectMakeWithDictionaryRepresentation(dict: CFDictionaryRef, rect: *mut CGRect) -> Boolean;
    fn CGEventSourceSecondsSinceLastEventType(state: CGEventSourceStateID, event_type: CGEventType)
        -> f64;
    fn CGEventCreate(source: *const c_void) -> CGEventRef;
    fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: CFTypeRef);
    fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
    fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> *const c_void;
    fn CFDictionaryGetValue(the_dict: CFDictionaryRef, key: *const c_void) -> *const c_void;
    fn CFNumberGetValue(number: CFNumberRef, the_type: CFNumberType, value_ptr: *mut c_void)
        -> Boolean;
    fn CFStringCreateWithCString(
        alloc: CFAllocatorRef,
        c_str: *const i8,
        encoding: CFStringEncoding,
    ) -> CFStringRef;
}

#[link(name = "objc")]
extern "C" {
    fn objc_getClass(name: *const i8) -> *mut c_void;
    fn sel_registerName(name: *const i8) -> *const c_void;
    fn objc_msgSend(obj: *mut c_void, sel: *const c_void, ...) -> *mut c_void;
}

pub fn get_windows() -> Vec<DesktopWindow> {
    // Same listing flags as Environment.swift WindowSense.poll.
    let options =
        K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
    let info = unsafe { CGWindowListCopyWindowInfo(options, K_CG_NULL_WINDOW_ID) };
    if info.is_null() {
        return Vec::new();
    }

    let our_pid = std::process::id() as i32;
    let key_number = cfstr("kCGWindowNumber");
    let key_pid = cfstr("kCGWindowOwnerPID");
    let key_layer = cfstr("kCGWindowLayer");
    let key_alpha = cfstr("kCGWindowAlpha");
    let key_bounds = cfstr("kCGWindowBounds");

    let mut out = Vec::new();
    unsafe {
        let n = CFArrayGetCount(info);
        for i in 0..n {
            let dict = CFArrayGetValueAtIndex(info, i);
            if dict.is_null() {
                continue;
            }
            // layer 0 = normal windows (WindowSense).
            let layer = dict_i32(dict, key_layer).unwrap_or(-1);
            if layer != 0 {
                continue;
            }
            let pid = dict_i32(dict, key_pid).unwrap_or(0);
            if pid == our_pid {
                continue;
            }
            let alpha = dict_f64(dict, key_alpha).unwrap_or(1.0);
            if alpha <= 0.05 {
                continue;
            }
            let id = dict_i32(dict, key_number).unwrap_or(0);
            if id == 0 {
                continue;
            }
            let bounds_dict = CFDictionaryGetValue(dict, key_bounds);
            if bounds_dict.is_null() {
                continue;
            }
            let mut rect = CGRect::default();
            if CGRectMakeWithDictionaryRepresentation(bounds_dict, &mut rect) == 0 {
                continue;
            }
            if rect.size.width <= 0.0 || rect.size.height <= 0.0 {
                continue;
            }
            out.push(DesktopWindow {
                id: id.to_string(),
                x: rect.origin.x,
                y: rect.origin.y,
                width: rect.size.width,
                height: rect.size.height,
            });
        }
        CFRelease(info);
        cf_release(key_number);
        cf_release(key_pid);
        cf_release(key_layer);
        cf_release(key_alpha);
        cf_release(key_bounds);
    }
    out
}

pub fn get_cursor() -> Point {
    unsafe {
        let event = CGEventCreate(ptr::null());
        if event.is_null() {
            return Point { x: 0.0, y: 0.0 };
        }
        let p = CGEventGetLocation(event);
        CFRelease(event as CFTypeRef);
        Point { x: p.x, y: p.y }
    }
}

pub fn get_idle_seconds() -> f64 {
    // Environment.swift userIdleSeconds: min across mouse/key/scroll.
    let types = [
        K_CG_EVENT_MOUSE_MOVED,
        K_CG_EVENT_LEFT_MOUSE_DOWN,
        K_CG_EVENT_KEY_DOWN,
        K_CG_EVENT_SCROLL_WHEEL,
    ];
    let mut min_idle = f64::MAX;
    for t in types {
        let s = unsafe { CGEventSourceSecondsSinceLastEventType(K_CG_EVENT_SOURCE_STATE_COMBINED_SESSION, t) };
        if s.is_finite() && s < min_idle {
            min_idle = s;
        }
    }
    if min_idle.is_finite() && min_idle < f64::MAX {
        min_idle.max(0.0)
    } else {
        0.0
    }
}

pub fn get_thermal_factor() -> f64 {
    // ProcessInfo.processInfo.thermalState — Environment.swift thermalTempo.
    unsafe {
        let class = objc_getClass(c"NSProcessInfo".as_ptr());
        if class.is_null() {
            return 1.0;
        }
        let sel_info = sel_registerName(c"processInfo".as_ptr());
        let sel_thermal = sel_registerName(c"thermalState".as_ptr());
        let info = objc_msgSend(class, sel_info);
        if info.is_null() {
            return 1.0;
        }
        let state = objc_msgSend(info, sel_thermal) as isize;
        match state {
            0 => 1.0,  // nominal
            1 => 1.15, // fair
            2 => 1.35, // serious
            3 => 1.5,  // critical
            _ => 1.0,
        }
    }
}

pub fn is_degraded() -> bool {
    false
}

pub fn backend() -> &'static str {
    "macos"
}

fn cf_release(cf: CFTypeRef) {
    if !cf.is_null() {
        unsafe { CFRelease(cf) }
    }
}

fn cfstr(s: &str) -> CFStringRef {
    let c = std::ffi::CString::new(s).unwrap_or_else(|_| std::ffi::CString::new("").unwrap());
    unsafe { CFStringCreateWithCString(ptr::null(), c.as_ptr(), K_CF_STRING_ENCODING_UTF8) }
}

fn dict_i32(dict: CFDictionaryRef, key: CFStringRef) -> Option<i32> {
    if key.is_null() {
        return None;
    }
    unsafe {
        let v = CFDictionaryGetValue(dict, key);
        if v.is_null() {
            return None;
        }
        let mut n: i32 = 0;
        if CFNumberGetValue(v, K_CF_NUMBER_INT_TYPE, &mut n as *mut i32 as *mut c_void) != 0 {
            Some(n)
        } else {
            None
        }
    }
}

fn dict_f64(dict: CFDictionaryRef, key: CFStringRef) -> Option<f64> {
    if key.is_null() {
        return None;
    }
    unsafe {
        let v = CFDictionaryGetValue(dict, key);
        if v.is_null() {
            return None;
        }
        let mut n: f64 = 0.0;
        if CFNumberGetValue(v, K_CF_NUMBER_DOUBLE_TYPE, &mut n as *mut f64 as *mut c_void) != 0 {
            Some(n)
        } else {
            None
        }
    }
}
