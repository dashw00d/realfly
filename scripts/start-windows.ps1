# Native Win32 Electron for DesktopFly.
# WSL/WSLg Linux Electron cannot see Windows mouse clicks (uiohook talks to X11/WSLg, not Win32).
$ErrorActionPreference = 'Stop'
$Root = 'C:\Users\ryan\sites\realfly'
$Node = 'C:\Program Files\nodejs\node.exe'
$Npm = 'C:\Program Files\nodejs\npm.cmd'

if (-not (Test-Path $Root)) {
  Write-Error "Missing $Root - from WSL run: pnpm sync:win"
}

if (-not (Test-Path $Node)) {
  Write-Error "Windows Node not found at $Node"
}

Set-Location $Root
Write-Host "DesktopFly: Windows Node $($(& $Node -v)) in $Root"

# Prebuilds are N-API (win32-x64). Skip electron-rebuild unless the user asks;
# VS is only needed if the prebuild fails to load.
if (-not (Test-Path "$Root\node_modules\electron")) {
  Write-Host 'DesktopFly: npm install --ignore-scripts (win32 Electron + uiohook prebuild)'
  & $Npm install --ignore-scripts
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$ElectronExe = Join-Path $Root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $ElectronExe)) {
  Write-Host 'DesktopFly: downloading Windows Electron binary'
  & $Node (Join-Path $Root 'node_modules\electron\install.js')
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& $Node scripts/build.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Electron = Join-Path $Root 'node_modules\electron\cli.js'
Write-Host 'DesktopFly: launching Win32 Electron - click near the fly to startle'
& $Node $Electron .
exit $LASTEXITCODE
