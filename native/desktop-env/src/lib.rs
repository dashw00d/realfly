//! NAPI-RS entry for `DesktopEnvironment`.
//!
//! JS sees camelCase: `getWindows`, `getCursor`, `getIdleSeconds`,
//! `getThermalFactor`, `isDegraded`, `backend`.
//!
//! Global mouse-down stays behind TypeScript `desktop.onMouseDown`.
//! Live tap-to-startle uses `uiohook-napi` in `src/main/global-mouse.ts`.
//! This crate may take over later; until then `on_mouse_down_supported` is false.
//!
//! Source-only on hosts without rustc: Electron JS fallback in
//! `src/main/desktop-env.ts` must keep working without `desktop-env.node`.

#![allow(dead_code)]

use napi_derive::napi;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as platform;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as platform;

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod platform {
    use crate::{DesktopWindow, Point};

    pub fn get_windows() -> Vec<DesktopWindow> {
        Vec::new()
    }
    pub fn get_cursor() -> Point {
        Point { x: 0.0, y: 0.0 }
    }
    pub fn get_idle_seconds() -> f64 {
        0.0
    }
    pub fn get_thermal_factor() -> f64 {
        1.0
    }
    pub fn is_degraded() -> bool {
        true
    }
    pub fn backend() -> &'static str {
        "unknown"
    }
}

/// Screen-coordinate window. `id` is HWND / CGWindowNumber / XID as a decimal string.
#[napi(object)]
#[derive(Clone, Debug)]
pub struct DesktopWindow {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[napi]
pub fn get_windows() -> Vec<DesktopWindow> {
    platform::get_windows()
}

#[napi]
pub fn get_cursor() -> Point {
    platform::get_cursor()
}

#[napi]
pub fn get_idle_seconds() -> f64 {
    platform::get_idle_seconds()
}

/// environmentTempo source. macOS thermalState, Windows speed-limit, Linux 1.0.
#[napi]
pub fn get_thermal_factor() -> f64 {
    let t = platform::get_thermal_factor();
    if t.is_finite() && t > 0.0 {
        t
    } else {
        1.0
    }
}

/// Native Wayland cannot enumerate foreign windows. X11/XWayland is the Linux path.
#[napi]
pub fn is_degraded() -> bool {
    platform::is_degraded()
}

/// `"windows" | "macos" | "x11" | "wayland" | "unknown"`
#[napi]
pub fn backend() -> String {
    platform::backend().to_string()
}

/// Phase 6 will flip this when a global hook is wired inside this crate only.
#[napi]
pub fn on_mouse_down_supported() -> bool {
    false
}
