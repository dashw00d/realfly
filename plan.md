We are porting https://github.com/DenisSergeevitch/desktop-fly into a windows / all platform electron app.

I'd rate the platforms roughly:

| Target            |          Difficulty | Why                                                                                                  |
| ----------------- | ------------------: | ---------------------------------------------------------------------------------------------------- |
| **Windows**       |            **5/10** | Electron handles almost everything; Win32 window enumeration is straightforward                      |
| **macOS**         |            **6/10** | Existing behavior is known, but native sensing has to be recreated                                   |
| **Linux X11**     |          **6–7/10** | Very doable, but more desktop-environment variance                                                   |
| **Linux Wayland** | **9/10 / degraded** | Wayland deliberately restricts the kinds of global positioning/window inspection this app depends on |

Electron itself explicitly warns that native Wayland generally prevents apps from freely positioning/moving/resizing windows, and recommends running via Xwayland when an application requires those capabilities. ([Electron][1]) For **DesktopFly**, I'd therefore officially support Linux through X11/Xwayland first rather than spending half the project fighting compositor-specific Wayland behavior.

## I would make Windows the primary port

Not macOS.

The architecture I'd use is:

```text
DesktopFly
│
├─ Electron main
│  ├─ tray
│  ├─ display manager
│  ├─ overlay manager
│  └─ environment adapter
│
├─ Three.js renderer
│  ├─ FlyScene
│  ├─ FlyModel
│  └─ BrainScene
│
├─ Simulation worker
│  ├─ LIFSim
│  ├─ SignalBuilder
│  └─ BrainSignals
│
├─ Shared behavior
│  ├─ walking
│  ├─ flight
│  ├─ grooming
│  ├─ sleep
│  └─ ledges
│
└─ native/
   └─ desktop-env
      ├─ windows
      ├─ macos
      └─ linux
```

### Electron should own the overlay

I'd make **one transparent BrowserWindow per physical monitor**, not one monster virtual-desktop-sized window.

Something conceptually like:

```ts
new BrowserWindow({
  x: display.bounds.x,
  y: display.bounds.y,
  width: display.bounds.width,
  height: display.bounds.height,

  transparent: true,
  frame: false,
  resizable: false,
  movable: false,
  focusable: false,
  skipTaskbar: true,
  alwaysOnTop: true,

  webPreferences: {
    backgroundThrottling: false
  }
})

win.setIgnoreMouseEvents(true, { forward: true })
```

Electron supports transparent/frameless windows, always-on-top behavior and passing mouse events through to whatever is underneath. ([Electron][1])

Electron's `screen` module already handles multiple displays, display changes, scaling, and absolute cursor position. ([Electron][2])

That removes a **huge** amount of OS-specific work.

---

# I'd actually add a tiny Rust layer

This is the one place where I'd change my previous recommendation.

Instead of:

```text
Electron
 ├ Mac Objective-C addon
 ├ Windows C++ addon
 └ Linux C addon
```

I'd make:

```text
Electron
       │
       │ Node-API
       ▼
 desktop-env.node
       │
      Rust
   ┌────┼─────┐
   ▼    ▼     ▼
 Win   Mac   Linux
```

using **NAPI-RS**.

NAPI-RS is specifically designed for precompiled cross-platform Node native addons and has maintained packaging/build support for Windows, macOS and Linux. ([NAPI-RS][3])

Then TypeScript gets one boring API:

```ts
interface DesktopEnvironment {
  getWindows(): DesktopWindow[]
  getCursor(): Point
  getIdleSeconds(): number

  onMouseDown(cb: (event: MouseEvent) => void): void

  getThermalFactor(): number
}
```

Everything north of that line stays identical across platforms.

## Windows window detection is easy

On Windows you essentially:

```text
EnumWindows()
    ↓
IsWindowVisible()
    ↓
DwmGetWindowAttribute()
    ↓
window rectangle
```

Windows exposes window bounding rectangles directly; `GetWindowRect` returns screen-coordinate bounds, and Microsoft recommends DWM extended-frame bounds when you want the visually apparent window rather than invisible resize borders. ([Microsoft Learn][4])

That gives us exactly what DesktopFly needs:

```ts
{
  id,
  x,
  y,
  width,
  height
}
```

Then:

```text
top of window
      ↓
walkable fly ledge
```

So the cool feature where the fly **walks along Chrome, Discord, VS Code, etc.** is completely viable on Windows.

---

# And there may already be a shortcut

I found **XCap**, a modern Rust project that already abstracts window/display access across:

* Windows
* macOS
* Linux X11
* Linux Wayland

and exposes `Window::all()` as a cross-platform concept. ([GitHub][5])

I wouldn't blindly make DesktopFly depend on its whole capture stack, but I'd absolutely investigate using its platform implementations as either:

**A. a dependency**

or

**B. reference code for our `desktop-env` crate.**

That's potentially a large chunk of the annoying platform work already solved.

Its own support table says Windows/macOS/X11 are fully supported for window capture while Wayland has caveats, which lines up almost perfectly with what I'd expect for DesktopFly. ([GitHub][5])

---

# The actual port sequence I'd use

This is important because I would **not** start by making the fly appear on the desktop.

### Phase 1 — brain

Port:

```text
Sim.swift
      ↓
LIFSim.ts
```

and reproduce:

```text
--simtest
--behaviortest
```

as automated JS tests.

The simulation is our ground truth.

No Electron.

No Three.

No desktop.

Just:

```bash
pnpm test
```

and:

```text
✓ GF silent at rest
✓ GF fires on loom
✓ walking circuit active
✓ DNg11 -> grooming
✓ MDN -> backwards
...
```

Once those pass, we know we didn't accidentally lobotomize the fly.

---

### Phase 2 — behavior

Translate the non-rendering part of:

```text
FlyModel.swift
```

into:

```text
Fly.ts
```

So the fly has:

```ts
position
heading
speed
state
altitude
gaitPhase
ledge
sleep
wingEffort
```

but still no graphics.

Tests continue passing.

---

### Phase 3 — Three.js fly

Then implement:

```text
SCNSphere       → SphereGeometry
SCNCapsule      → CapsuleGeometry
SCNNode         → Object3D / Group
SCNMaterial     → MeshStandardMaterial
SCNLight        → DirectionalLight
```

The procedural nature of the current fly makes this unusually friendly. The original is built from primitive geometry and transforms rather than some insane SceneKit-specific rig.

At that point:

```text
browser window
 └ fly wandering around black/transparent canvas
```

---

### Phase 4 — Electron overlay

Now make it:

```text
desktop
    🪰
 Chrome
 VS Code
 Discord
```

Electron handles transparency, cursor coordinates and display topology. ([Electron][1])

---

### Phase 5 — Windows ecology

Implement first:

```text
window enumeration
        ↓
window top edges
        ↓
ledges
```

Then:

```text
new window
   ↓
loom signal
   ↓
fly's brain
   ↓
OH SHIT
   ↓
takeoff
```

This is where the app becomes hilarious again.

---

### Phase 6 — global clicks

This requires a tiny native/global input component.

There are already N-API bindings around `libuiohook` exposing global mouse down/up/move/click events and coordinates. ([GitHub][6])

But I would hide whatever implementation we choose behind:

```ts
desktop.onMouseDown(...)
```

rather than letting a third-party hook library infect the application architecture.

If it breaks later, replace one module.

---

# One thing I'd deliberately simplify

The existing app includes:

```text
Mac temperature
      ↓
fly temperature
      ↓
fly movement speed
```

Electron exposes proper thermal-state reporting on macOS, but its thermal-state API is macOS-specific. Windows does expose CPU speed-limit notifications through Electron, though. ([Electron][7])

So I'd generalize this from:

```text
thermalTempo
```

to:

```text
environmentTempo
```

with:

```text
macOS
thermal state

Windows
speed limit / power state

Linux
1.0 fallback
```

Nobody cares whether the microscopic fake fruit fly has physiologically rigorous CPU-temperature awareness on Ubuntu. 😂

---

# Linux would be intentionally tiered

I'd document support as:

```text
Windows           ★★★★★
macOS             ★★★★★
Linux X11         ★★★★☆
Linux XWayland    ★★★★☆
Linux native WL   ★★☆☆☆
```

Native Wayland is the weird one.

Wayland isolates X11 and native Wayland clients and deliberately shifts window-management authority toward the compositor. ([Wayland][8])

For this application specifically, that's brutal because our entire gimmick is:

> **know where other applications' windows are and position a transparent creature relative to them.**

That's basically the exact class of global desktop knowledge Wayland is designed to make less universal.

So I'd simply ship Linux with XWayland initially.

---

## My revised difficulty estimate

With the architecture above:

**A working Windows version:** very reasonable.

**Windows + macOS:** still straightforward.

**Windows + macOS + Linux X11/XWayland:** completely realistic.

**Perfect native Wayland parity:** that's the part I'd call legitimately hard.

And I think this could actually become **much cooler than the original** once it's Electron/Three.js because now we're not married to Apple's rendering APIs. We could easily start adding other creatures, model loading, shaders, particles, multiple brains, editable behavior profiles, desktop food, predator/prey shit, etc. without touching the native integration layer.

The fork I'd build is essentially **a little cross-platform desktop-creature engine, with DesktopFly as creature #1**, rather than hard-coding the entire architecture around one fly.

[1]: https://www.electronjs.org/docs/latest/api/browser-window?utm_source=chatgpt.com "BrowserWindow | Electron"
[2]: https://www.electronjs.org/docs/latest/api/screen/?utm_source=chatgpt.com "screen | Electron"
[3]: https://napi.rs/ "NAPI-RS – NAPI-RS"
[4]: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect?utm_source=chatgpt.com "GetWindowRect function (winuser.h) - Win32 apps | Microsoft Learn"
[5]: https://github.com/nashaofu/xcap "GitHub - nashaofu/xcap: XCap is a cross-platform screen capture library written in Rust. It supports Linux (X11, Wayland), MacOS, and Windows. XCap supports screenshot and video recording (WIP). · GitHub"
[6]: https://github.com/SnosMe/uiohook-napi "GitHub - SnosMe/uiohook-napi · GitHub"
[7]: https://www.electronjs.org/docs/latest/api/power-monitor/?utm_source=chatgpt.com "powerMonitor | Electron"
[8]: https://wayland.freedesktop.org/docs/book/Xwayland.html?utm_source=chatgpt.com "X11 Application Support - Wayland"
