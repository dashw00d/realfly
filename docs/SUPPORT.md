# Support matrix

realfly is a **port** of the macOS DesktopFly overlay. Windows is the
primary overlay target. Linux ships via X11/XWayland. Native Wayland is
degraded — **this is not parity**.

| Target | Rating | Notes |
|---|---|---|
| Windows | ★★★★★ | Primary overlay target. Electron overlay + Win32 `EnumWindows` + DWM extended-frame bounds → walkable ledges. |
| macOS | ★★★★★ | Existing upstream behavior is known; native sensing is recreated behind `DesktopEnvironment` (`CGWindowList`, idle, thermal state). |
| Linux X11 | ★★★★☆ | Official Linux path. EWMH client list for ledges; more desktop-environment variance than Win/mac. |
| Linux XWayland | ★★★★☆ | Ship Linux through XWayland when the session is Wayland (`DISPLAY` set). Overlay placement and window inspection work like X11. |
| Linux native Wayland | ★★☆☆☆ | Degraded. Compositors block global window inspection and free overlay positioning. |

Numbers match [`PORT_CONTRACT.md`](PORT_CONTRACT.md). Architecture notes
live in [`../plan.md`](../plan.md).

## What each star rating means

**★★★★★ Windows / macOS** — transparent click-through overlay per physical
display, tray, multi-monitor hop, cursor loom, circadian/sleep, and
`desktop.onMouseDown` tap-to-startle (`uiohook-napi`, rebuilt for Electron).
Window ledges / window looms need `desktop-env.node`. `environmentTempo`
comes from macOS thermal state or Windows CPU speed-limit / power (1.0 when
unlimited).

**★★★★☆ Linux X11 / XWayland** — same overlay and sim. Window enumeration
is X11/EWMH. `environmentTempo` is **1.0**. Desktop-environment differences
(window managers, compositors-on-X11) can drop some ledges. This is the
supported Linux path.

**★★☆☆☆ native Wayland** — the fly may still render in a local window, but
the desktop-creature gimmick does not work. No foreign-window ledges, no
reliable always-on-top placement, no claim of feature parity.

## Why native Wayland is ★★☆☆☆

The entire gimmick is:

> **know where other applications' windows are and position a transparent
> creature relative to them.**

That is the class of global desktop knowledge Wayland is designed to make
less universal. Wayland isolates clients and shifts window-management
authority to the compositor. Electron explicitly warns that native Wayland
generally prevents apps from freely positioning, moving, or resizing
windows, and recommends **XWayland** when an application needs those
capabilities.

Consequences for this app on a native Wayland session:

- cannot enumerate other apps' windows → empty ledge list, no window-loom
- cannot freely place always-on-top, click-through overlays on each display
- global click-to-startle still needs a native hook (`desktop.onMouseDown`);
  the JS fallback cannot see desktop-wide mouse-down because overlay
  windows are click-through

**Do not claim native Wayland parity.** If your session is Wayland, run
via XWayland (`DISPLAY` set) so the X11 path is used.

**WSL2 / WSLg is not a Windows build.** Linux Electron under WSLg cannot
see Win32 mouse clicks or other apps' windows. Use `pnpm start:win` /
`C:\Users\ryan\sites\realfly` (Windows Node + Windows Electron).

## Native addon vs JS fallback

`native/desktop-env` is a NAPI-RS crate. **`rustc` / `cargo` are not
required to run the app.** On hosts without Rust (including this Linux
dev machine), `createDesktopEnvironment()` loads the JavaScript fallback.

**`pnpm start` uses that JS fallback until `native/desktop-env` is built.**

| Capability | JS fallback | Native addon |
|---|---|---|
| Overlay + 1 kHz brain + tray | yes | yes |
| Cursor position / idle seconds | Electron `screen` / `powerMonitor` | native |
| Window list → ledges / window loom | empty | Win32 / CGWindowList / X11 |
| `environmentTempo` | 1.0 | macOS thermal / Windows speed-limit; Linux 1.0 |
| Global `onMouseDown` (tap-to-startle) | `uiohook-napi` | same, unless crate sets `onMouseDownSupported` |

App code must talk to `desktop.onMouseDown` only. Never import libuiohook
outside `src/main/desktop-env.ts` / `src/main/global-mouse.ts`.

Rebuild the hook after `pnpm install` (`postinstall` runs
`pnpm rebuild:hooks`). Native Wayland still cannot see global clicks.
