# native/desktop-env

NAPI-RS addon that implements `DesktopEnvironment` below the TypeScript line
in `src/main/desktop-env.ts`. **Source-only on this host** (`rustc`/`cargo` are
not installed). Electron fallback must keep working without `desktop-env.node`.

App code talks to `desktop.onMouseDown` — never import libuiohook (or any
hook crate) outside `src/main/desktop-env.ts` / `src/main/global-mouse.ts`.
`onMouseDown(cb)` returns an unsubscribe function. Tap-to-startle is armed
via `uiohook-napi` in the JS desktop-env even when this crate is unbuilt.
This crate may later replace that hook (`on_mouse_down_supported`).

## Plan

```
Electron (src/main/desktop-env.ts)
        │  Node-API
        ▼
 desktop-env.node     ← this crate (cdylib)
        │
       Rust
   ┌────┼─────┐
   ▼    ▼     ▼
 Win   Mac   Linux     src/windows.rs  src/macos.rs  src/linux.rs
```

`createDesktopEnvironment()` tries `require` on `desktop-env*.node`. On
failure it uses `FallbackDesktopEnvironment`: Electron
`screen.getCursorScreenPoint`, `powerMonitor.getSystemIdleTime`, empty
window list, `thermalFactor` 1.0, and `uiohook-napi` for `onMouseDown`.

This directory's `index.js` is the same load-or-stub path for the crate.

## Windows (primary overlay target)

```
EnumWindows()
    ↓
IsWindowVisible()
    ↓
DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)
    ↓  fallback GetWindowRect
{ id, x, y, width, height }
```

`GetWindowRect` is screen coordinates; Microsoft recommends DWM extended-frame
bounds for the visually apparent window (not invisible resize borders). Top
edge of that rect becomes a walkable fly ledge.

## macOS

Best-effort `CGWindowListCopyWindowInfo` (on-screen, exclude desktop
elements) matching upstream `WindowSense`. Idle via
`CGEventSourceSecondsSinceLastEventType`. `thermalState` → 1.0 / 1.15 /
1.35 / 1.5.

## Linux

X11 first (`dlopen` libX11, `_NET_CLIENT_LIST_STACKING`). Native Wayland
returns an empty window list and `isDegraded() === true`. XWayland
(`DISPLAY` set) is the supported Linux path. `environmentTempo` is 1.0.

## XCap as reference

[XCap](https://github.com/nashaofu/xcap) already abstracts `Window::all()`
across Windows, macOS, Linux X11, and (caveated) Wayland. Do **not** pull in
its full capture stack. Platform modules here follow its listing approach
(Win32 EnumWindows + DWM bounds; macOS CGWindowList; X11 EWMH client list).

## Platform notes

| OS | Window list | Cursor / idle | environmentTempo (`getThermalFactor`) |
| --- | --- | --- | --- |
| Windows | EnumWindows + DWM bounds | native | CPU speed-limit / power; 1.0 if unlimited |
| macOS | CGWindowList (upstream `WindowSense`) | native | `ProcessInfo.thermalState` → 1.0 / 1.15 / 1.35 / 1.5 |
| Linux X11 | X11 / XCap-style EWMH | native | **1.0** |
| Linux XWayland | same as X11 | same | **1.0** |
| Linux native Wayland | degraded (compositor blocks inspection) | Electron fallback | **1.0** |

Global mouse-down (Phase 6) stays behind `onMouseDown`. A `libuiohook` (or
equivalent) binding may live **only** in this crate.

## Build (later, on a host with rustc)

```sh
# from repo root, once napi-cli / @napi-rs/cli is wired
pnpm exec napi build --platform --release --manifest-path native/desktop-env/Cargo.toml
```

Until then, `createDesktopEnvironment()` returns the JS fallback. Do not run
`cargo`/`napi` build on this host — rustc is missing.
