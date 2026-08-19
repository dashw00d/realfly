//! X11 / XWayland window list. Native Wayland is degraded (no global inspection).
//!
//! environmentTempo is **1.0**. XCap's `_NET_CLIENT_LIST_STACKING` path is the
//! reference implementation — we do **not** depend on xcap (its capture stack
//! is not tiny). libX11 / libXss are `dlopen`'d so this addon still loads on
//! Wayland-only hosts without libX11.
//!
//! Degraded flag: `is_degraded()` is true when the session is Wayland and no
//! usable X11/XWayland `DISPLAY` connection exists. `get_windows()` then
//! returns `[]`. Official Linux path is X11 or XWayland.

#![allow(non_camel_case_types, non_snake_case, dead_code)]

use std::ffi::{c_void, CString};
use std::ptr;
use std::sync::Mutex;

use crate::{DesktopWindow, Point};

const RTLD_LAZY: i32 = 1;
const XA_CARDINAL: u64 = 6;
const SUCCESS: i32 = 0;

type Display = c_void;
type Window = u64;
type Atom = u64;
type Status = i32;

#[link(name = "dl")]
extern "C" {
    fn dlopen(filename: *const i8, flags: i32) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const i8) -> *mut c_void;
}

struct X11Fns {
    XOpenDisplay: unsafe extern "C" fn(*const i8) -> *mut Display,
    XCloseDisplay: unsafe extern "C" fn(*mut Display) -> i32,
    XDefaultScreen: unsafe extern "C" fn(*mut Display) -> i32,
    XRootWindow: unsafe extern "C" fn(*mut Display, i32) -> Window,
    XInternAtom: unsafe extern "C" fn(*mut Display, *const i8, i32) -> Atom,
    XGetWindowProperty: unsafe extern "C" fn(
        *mut Display,
        Window,
        Atom,
        i64,
        i64,
        i32,
        Atom,
        *mut Atom,
        *mut i32,
        *mut u64,
        *mut u64,
        *mut *mut u8,
    ) -> i32,
    XFree: unsafe extern "C" fn(*mut c_void) -> i32,
    XGetGeometry: unsafe extern "C" fn(
        *mut Display,
        Window,
        *mut Window,
        *mut i32,
        *mut i32,
        *mut u32,
        *mut u32,
        *mut u32,
        *mut u32,
    ) -> Status,
    XTranslateCoordinates: unsafe extern "C" fn(
        *mut Display,
        Window,
        Window,
        i32,
        i32,
        *mut i32,
        *mut i32,
        *mut Window,
    ) -> i32,
    XQueryPointer: unsafe extern "C" fn(
        *mut Display,
        Window,
        *mut Window,
        *mut Window,
        *mut i32,
        *mut i32,
        *mut i32,
        *mut i32,
        *mut u32,
    ) -> i32,
    XQueryTree: unsafe extern "C" fn(
        *mut Display,
        Window,
        *mut Window,
        *mut Window,
        *mut *mut Window,
        *mut u32,
    ) -> Status,
    XSetErrorHandler: unsafe extern "C" fn(unsafe extern "C" fn(*mut Display, *mut c_void) -> i32)
        -> *mut c_void,
}

struct XssFns {
    XScreenSaverQueryExtension: unsafe extern "C" fn(*mut Display, *mut i32, *mut i32) -> i32,
    XScreenSaverQueryInfo: unsafe extern "C" fn(*mut Display, Window, *mut XScreenSaverInfo) -> i32,
}

#[repr(C)]
struct XScreenSaverInfo {
    window: Window,
    state: i32,
    kind: i32,
    til_or_since: u64,
    idle: u64,
    event_mask: u64,
}

struct XConn {
    dpy: *mut Display,
    root: Window,
    fns: X11Fns,
    xss: Option<XssFns>,
}

unsafe impl Send for XConn {}

static CONN: Mutex<Option<XConn>> = Mutex::new(None);

unsafe extern "C" fn ignore_x_error(_dpy: *mut Display, _err: *mut c_void) -> i32 {
    0
}

fn display_set() -> bool {
    std::env::var_os("DISPLAY")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
}

fn wayland_session() -> bool {
    std::env::var_os("WAYLAND_DISPLAY")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
        || std::env::var("XDG_SESSION_TYPE")
            .map(|v| v.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
}

/// Native Wayland (no XWayland `DISPLAY`): empty windows, documented degraded.
fn wayland_only() -> bool {
    wayland_session() && !display_set()
}

fn with_x11<T>(f: impl FnOnce(&XConn) -> T) -> Option<T> {
    if wayland_only() {
        return None;
    }
    let mut slot = CONN.lock().ok()?;
    if slot.is_none() {
        *slot = unsafe { open_x11() };
    }
    slot.as_ref().map(f)
}

pub fn is_degraded() -> bool {
    wayland_only() || (wayland_session() && with_x11(|_| ()).is_none())
}

pub fn backend() -> &'static str {
    if wayland_only() {
        return "wayland";
    }
    if with_x11(|_| ()).is_some() {
        "x11"
    } else if wayland_session() {
        "wayland"
    } else {
        "x11"
    }
}

pub fn get_windows() -> Vec<DesktopWindow> {
    with_x11(|conn| {
        let our_pid = std::process::id();
        client_list(conn)
            .into_iter()
            .filter_map(|id| window_geom(conn, id, our_pid))
            .collect()
    })
    .unwrap_or_default()
}

pub fn get_cursor() -> Point {
    with_x11(|conn| {
        let mut root_ret: Window = 0;
        let mut child: Window = 0;
        let mut root_x = 0i32;
        let mut root_y = 0i32;
        let mut win_x = 0i32;
        let mut win_y = 0i32;
        let mut mask = 0u32;
        unsafe {
            (conn.fns.XQueryPointer)(
                conn.dpy,
                conn.root,
                &mut root_ret,
                &mut child,
                &mut root_x,
                &mut root_y,
                &mut win_x,
                &mut win_y,
                &mut mask,
            );
        }
        Point {
            x: root_x as f64,
            y: root_y as f64,
        }
    })
    .unwrap_or(Point { x: 0.0, y: 0.0 })
}

pub fn get_idle_seconds() -> f64 {
    with_x11(|conn| {
        let Some(xss) = conn.xss.as_ref() else {
            return 0.0;
        };
        unsafe {
            let mut ev = 0i32;
            let mut err = 0i32;
            if (xss.XScreenSaverQueryExtension)(conn.dpy, &mut ev, &mut err) == 0 {
                return 0.0;
            }
            let mut info = XScreenSaverInfo {
                window: 0,
                state: 0,
                kind: 0,
                til_or_since: 0,
                idle: 0,
                event_mask: 0,
            };
            if (xss.XScreenSaverQueryInfo)(conn.dpy, conn.root, &mut info) == 0 {
                return 0.0;
            }
            info.idle as f64 / 1000.0
        }
    })
    .unwrap_or(0.0)
}

pub fn get_thermal_factor() -> f64 {
    1.0
}

fn client_list(conn: &XConn) -> Vec<Window> {
    for atom_name in ["_NET_CLIENT_LIST_STACKING", "_NET_CLIENT_LIST"] {
        if let Some(list) = get_window_list_atom(conn, atom_name) {
            if !list.is_empty() {
                return list;
            }
        }
    }
    query_tree_children(conn)
}

fn get_window_list_atom(conn: &XConn, name: &str) -> Option<Vec<Window>> {
    let cname = CString::new(name).ok()?;
    unsafe {
        let atom = (conn.fns.XInternAtom)(conn.dpy, cname.as_ptr(), 1);
        if atom == 0 {
            return None;
        }
        let mut actual_type: Atom = 0;
        let mut actual_format = 0i32;
        let mut nitems = 0u64;
        let mut bytes_after = 0u64;
        let mut prop: *mut u8 = ptr::null_mut();
        let status = (conn.fns.XGetWindowProperty)(
            conn.dpy,
            conn.root,
            atom,
            0,
            4096,
            0,
            0,
            &mut actual_type,
            &mut actual_format,
            &mut nitems,
            &mut bytes_after,
            &mut prop,
        );
        if status != SUCCESS || prop.is_null() || nitems == 0 {
            if !prop.is_null() {
                (conn.fns.XFree)(prop as *mut c_void);
            }
            return None;
        }
        let mut out = Vec::with_capacity(nitems as usize);
        if actual_format == 32 {
            let slice = std::slice::from_raw_parts(prop as *const u32, nitems as usize);
            for &id in slice {
                if id != 0 {
                    out.push(id as Window);
                }
            }
        }
        (conn.fns.XFree)(prop as *mut c_void);
        Some(out)
    }
}

fn query_tree_children(conn: &XConn) -> Vec<Window> {
    let mut root_ret: Window = 0;
    let mut parent: Window = 0;
    let mut children: *mut Window = ptr::null_mut();
    let mut n = 0u32;
    unsafe {
        let st = (conn.fns.XQueryTree)(
            conn.dpy,
            conn.root,
            &mut root_ret,
            &mut parent,
            &mut children,
            &mut n,
        );
        if st == 0 || children.is_null() {
            return Vec::new();
        }
        let slice = std::slice::from_raw_parts(children, n as usize);
        let out = slice.to_vec();
        (conn.fns.XFree)(children as *mut c_void);
        out
    }
}

fn window_pid(conn: &XConn, win: Window) -> Option<u32> {
    let cname = CString::new("_NET_WM_PID").ok()?;
    unsafe {
        let atom = (conn.fns.XInternAtom)(conn.dpy, cname.as_ptr(), 1);
        if atom == 0 {
            return None;
        }
        let mut actual_type: Atom = 0;
        let mut actual_format = 0i32;
        let mut nitems = 0u64;
        let mut bytes_after = 0u64;
        let mut prop: *mut u8 = ptr::null_mut();
        let status = (conn.fns.XGetWindowProperty)(
            conn.dpy,
            win,
            atom,
            0,
            1,
            0,
            XA_CARDINAL,
            &mut actual_type,
            &mut actual_format,
            &mut nitems,
            &mut bytes_after,
            &mut prop,
        );
        if status != SUCCESS || prop.is_null() || nitems == 0 {
            if !prop.is_null() {
                (conn.fns.XFree)(prop as *mut c_void);
            }
            return None;
        }
        let pid = *(prop as *const u32);
        (conn.fns.XFree)(prop as *mut c_void);
        Some(pid)
    }
}

fn window_geom(conn: &XConn, win: Window, our_pid: u32) -> Option<DesktopWindow> {
    if let Some(pid) = window_pid(conn, win) {
        if pid == our_pid {
            return None;
        }
    }
    let mut root: Window = 0;
    let mut x = 0i32;
    let mut y = 0i32;
    let mut width = 0u32;
    let mut height = 0u32;
    let mut border = 0u32;
    let mut depth = 0u32;
    unsafe {
        if (conn.fns.XGetGeometry)(
            conn.dpy,
            win,
            &mut root,
            &mut x,
            &mut y,
            &mut width,
            &mut height,
            &mut border,
            &mut depth,
        ) == 0
        {
            return None;
        }
        let mut abs_x = 0i32;
        let mut abs_y = 0i32;
        let mut child: Window = 0;
        (conn.fns.XTranslateCoordinates)(
            conn.dpy,
            win,
            conn.root,
            0,
            0,
            &mut abs_x,
            &mut abs_y,
            &mut child,
        );
        if width == 0 || height == 0 {
            return None;
        }
        Some(DesktopWindow {
            id: win.to_string(),
            x: abs_x as f64,
            y: abs_y as f64,
            width: width as f64,
            height: height as f64,
        })
    }
}

unsafe fn open_x11() -> Option<XConn> {
    let lib_x11 = load_lib(&["libX11.so.6", "libX11.so"])?;
    let fns = X11Fns {
        XOpenDisplay: dlsym_fn(lib_x11, "XOpenDisplay")?,
        XCloseDisplay: dlsym_fn(lib_x11, "XCloseDisplay")?,
        XDefaultScreen: dlsym_fn(lib_x11, "XDefaultScreen")?,
        XRootWindow: dlsym_fn(lib_x11, "XRootWindow")?,
        XInternAtom: dlsym_fn(lib_x11, "XInternAtom")?,
        XGetWindowProperty: dlsym_fn(lib_x11, "XGetWindowProperty")?,
        XFree: dlsym_fn(lib_x11, "XFree")?,
        XGetGeometry: dlsym_fn(lib_x11, "XGetGeometry")?,
        XTranslateCoordinates: dlsym_fn(lib_x11, "XTranslateCoordinates")?,
        XQueryPointer: dlsym_fn(lib_x11, "XQueryPointer")?,
        XQueryTree: dlsym_fn(lib_x11, "XQueryTree")?,
        XSetErrorHandler: dlsym_fn(lib_x11, "XSetErrorHandler")?,
    };
    (fns.XSetErrorHandler)(ignore_x_error);
    let dpy = (fns.XOpenDisplay)(ptr::null());
    if dpy.is_null() {
        return None;
    }
    let screen = (fns.XDefaultScreen)(dpy);
    let root = (fns.XRootWindow)(dpy, screen);
    let lib_xss = load_lib(&["libXss.so.1", "libXss.so"]);
    let xss = lib_xss.and_then(|h| {
        Some(XssFns {
            XScreenSaverQueryExtension: dlsym_fn(h, "XScreenSaverQueryExtension")?,
            XScreenSaverQueryInfo: dlsym_fn(h, "XScreenSaverQueryInfo")?,
        })
    });
    Some(XConn {
        dpy,
        root,
        fns,
        xss,
    })
}

fn load_lib(names: &[&str]) -> Option<*mut c_void> {
    for name in names {
        let Ok(c) = CString::new(*name) else {
            continue;
        };
        let h = unsafe { dlopen(c.as_ptr(), RTLD_LAZY) };
        if !h.is_null() {
            return Some(h);
        }
    }
    None
}

fn dlsym_fn<T>(handle: *mut c_void, name: &str) -> Option<T> {
    let c = CString::new(name).ok()?;
    let p = unsafe { dlsym(handle, c.as_ptr()) };
    if p.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute_copy(&p) })
}
