# PrismPad

<p align="center">
  <img src="docs/assets/prismpad-icon.png" alt="PrismPad icon" width="220">
</p>

<p align="center">
  <a href="https://github.com/VesperEngineering/PrismPad/actions/workflows/ci.yml"><img src="https://github.com/VesperEngineering/PrismPad/actions/workflows/ci.yml/badge.svg?branch=main" alt="Build status"></a>
  <a href="https://github.com/VesperEngineering/PrismPad/releases/latest"><img src="https://img.shields.io/github/v/release/VesperEngineering/PrismPad?display_name=tag&sort=semver" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows11&logoColor=white" alt="Windows 10 and 11">
  <img src="https://img.shields.io/badge/Ubuntu-24.04%2B-E95420?logo=ubuntu&logoColor=white" alt="Ubuntu 24.04 or newer">
</p>

PrismPad is a lightweight, local-first desktop text editor for 64-bit Windows 10/11 and 64-bit Ubuntu 24.04 LTS or newer. It deliberately remains an editor, not an IDE: no autocomplete, language servers, terminal, debugger, code execution, Git integration, extensions, accounts, sync, telemetry, or network service is included.

On a fresh launch it asks: **“Hello! What will you code in today?”** The chooser creates a new document in one of the supported languages or opens an existing local file.

## Features and privacy

- Multiple connected rectangular tabs; safe New, Open, Save, Save As, Close Tab, and Close Window flows.
- UTF-8/BOM and LF/CRLF preservation, binary/large-file protection, atomic saves where supported, and external-change choices to reload, compare, or keep the editor version.
- Extension-recognized syntax highlighting, find/replace, undo/redo, bracket pairs, auto-indent, folding, multiple selections, word wrap, zoom, whitespace, indentation guides, and draggable tabs.
- Sanitized local Markdown preview. Raw HTML, remote images, links, and scripts are neutralized; preview never fetches remote content.
- Light/dark/system theme and local settings. Session restoration stores only path-backed document metadata, tab order, and view positions—never unsaved document contents.

PrismPad runs locally. Its production output and source are checked for network APIs and non-loopback remote destinations by `npm run audit:offline`.

## Supported languages

| Language | Extensions |
| --- | --- |
| Plain Text | `.txt` and unknown extensions |
| Python | `.py`, `.pyw` |
| Markdown | `.md`, `.markdown` |
| YAML | `.yaml`, `.yml` |
| JSON | `.json`, `.jsonc` |
| JavaScript | `.js`, `.mjs`, `.cjs` |
| TypeScript | `.ts`, `.mts`, `.cts` |
| JSX / TSX | `.jsx`, `.tsx` |
| HTML | `.html`, `.htm` |
| CSS | `.css` |
| Shell | `.sh`, `.bash`, `.zsh` |
| PowerShell | `.ps1`, `.psm1`, `.psd1` |
| Rust | `.rs` |
| C / C++ | `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh`, `.hxx` |
| Java | `.java` |
| SQL | `.sql` |
| TOML | `.toml` |
| XML | `.xml` |

## Keyboard and status controls

Use the File, Edit, View, and Help menus or their visible native shortcuts: `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+W`, `Ctrl+F`, `Ctrl+H`, `Alt+Z`, `Ctrl+=`, `Ctrl+-`, `Ctrl+Shift+M`, and `Ctrl+Shift+T` (use `Cmd` on macOS where applicable, though macOS is not a supported package target). The status bar shows language, line/column, UTF-8 encoding, line endings, and indentation; its indentation control opens only the relevant setting.

## Development

Prerequisites: Node.js 22.12+, a stable Rust toolchain with `rustfmt` and `clippy`, and the [Tauri v2 platform prerequisites](https://v2.tauri.app/start/prerequisites/). Ubuntu builds also need WebKitGTK 4.1 development packages, build tools, OpenSSL, AppIndicator, librsvg, `webkit2gtk-driver`, and Xvfb for packaged E2E. Windows E2E requires an `msedgedriver` version matching the installed Microsoft Edge; `msedgedriver-tool` can install that driver into the current directory.

```sh
npm ci
npm run tauri dev
npm run check
npm run check:e2e
npm test
npm run build
npm run audit:offline
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

The packaged WebView suite drives the real Tauri webview, not a browser stand-in. On Ubuntu, first create the release-profile executable without an installer:

```sh
npm run tauri build -- --no-bundle
```

On Ubuntu, install `tauri-driver` with `cargo install tauri-driver --version 2.0.6 --locked`, start `xvfb-run -a tauri-driver --port 4444` in one terminal, then run `PRISMPAD_E2E_APP=src-tauri/target/release/prism-pad npm run test:e2e` in another. The executable is supplied through the required `tauri:options` capability; it is not a positional `tauri-driver` argument.

Windows uses Microsoft’s documented attach flow. Build the test executable with PrismPad's compile-time-scoped automation feature; normal builds and installers omit this hook:

```powershell
npm run tauri build -- --no-bundle --features e2e-automation
```

Install the reviewed matching-driver helper, run it, and put the resulting `msedgedriver.exe` on `PATH`:

```powershell
cargo install --git https://github.com/chippers/msedgedriver-tool --rev 8c4b34f51b45f5cf08013366d703de464ab871d1 --locked
msedgedriver-tool
```

Start `msedgedriver --port=4444 --host=127.0.0.1` in one PowerShell terminal. In another, launch a fresh packaged process with its WebView2 debugging endpoint, wait for that endpoint, and run one spec:

```powershell
$env:PRISMPAD_E2E_APP='src-tauri/target/release/prism-pad.exe'
$env:PRISMPAD_E2E_DEBUGGER_ADDRESS='127.0.0.1:9222'
$env:PRISMPAD_E2E_WEBVIEW_AUTOMATION='1'
$app = $null
$ready = $false
try {
  $app = Start-Process $env:PRISMPAD_E2E_APP -PassThru
  for ($attempt = 0; $attempt -lt 30 -and !$ready; $attempt++) {
    try { Invoke-WebRequest 'http://127.0.0.1:9222/json/version' -UseBasicParsing | Out-Null; $ready = $true }
    catch { Start-Sleep -Seconds 1 }
  }
  if (!$ready) { throw 'packaged WebView2 debugging endpoint did not become ready' }
  npm run test:e2e -- --spec e2e/startup.e2e.ts
} finally {
  if ($app) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item Env:PRISMPAD_E2E_WEBVIEW_AUTOMATION -ErrorAction SilentlyContinue
}
```

Repeat with a fresh app process for `e2e/file-workflow.e2e.ts` and each performance or idle spec. The CI workflow is the canonical automated sequence: it applies readiness bounds, cleans up stale WebView2 processes, and waits for port 9222 to close between sessions.

The WebView suite covers startup, editing, unsaved-tab decisions, Markdown preview, settings persistence, and tab ordering. Native file dialogs and installer UI are intentionally not faked through DOM controls. Executable Rust and controller tests cover Save As extension selection, BOM/line-ending round trips, changed-on-disk write conflicts, and external-change decisions, while CI validates generated packages structurally.

The packaged WebDriver suite cannot safely seed the native plugin store or automate operating-system dialogs, so it does not claim a packaged path-backed restoration scenario. Metadata-only restoration, unreadable-path handling, and native dialog command wiring remain covered by the unit/integration suite. Adding packaged restoration requires a supported native test hook; PrismPad does not add a production fixture mode for this purpose.

## Packaging, release downloads, and CI artifacts

Build release bundles with `npm run tauri build`. Package outputs are written to these concrete locations:

- Windows portable executable: `src-tauri/target/release/prism-pad.exe` (run it directly).
- Windows NSIS: `src-tauri/target/release/bundle/nsis/*.exe` (run the installer normally).
- Ubuntu DEB: `src-tauri/target/release/bundle/deb/*.deb` (install with `sudo apt install ./src-tauri/target/release/bundle/deb/<package>.deb`).
- Ubuntu AppImage: `src-tauri/target/release/bundle/appimage/*.AppImage` (mark it executable with `chmod +x <file>.AppImage`, then run it).

The guarded v0.1.0 release publishes exactly four clearly named downloads: `PrismPad-v0.1.0-windows-x64-portable.exe`, `PrismPad-v0.1.0-windows-x64-setup.exe`, `PrismPad-v0.1.0-linux-x64.AppImage`, and `PrismPad-v0.1.0-ubuntu-24.04-x64.deb`. The portable choices are the Windows executable and Linux AppImage; the NSIS and Debian files are installers.

The separate CI workflow retains validated bundles, driver logs, and a required performance report as temporary workflow artifacts. The public release attaches only the four packages above after Windows and Ubuntu validation succeeds. This release is unsigned; Windows may show a Microsoft Defender SmartScreen warning. Code signing requires a future Vesper Applied LLC Authenticode certificate and protected signing configuration.
