# PrismPad Design Specification

**Date:** 2026-07-21  
**Status:** Approved design, pending written-spec review  
**Repository:** `VesperEngineering/PrismPad`

## 1. Product Definition

PrismPad is a lightweight, local-first desktop text editor for Windows and Linux. It combines the immediate, uncluttered experience of Notepad with modern code-editing fundamentals. It is deliberately an editor rather than an IDE.

Version 1 officially targets 64-bit Windows 10/11 and 64-bit Ubuntu 24.04 LTS or newer. Linux delivery includes a Debian package and AppImage; other compatible WebKitGTK distributions may work but are not release-blocking targets.

The first release supports multiple open documents in tabs, extension-driven syntax highlighting, light and dark themes, a language-first welcome screen, and familiar editing conveniences. It does not include autocomplete, code execution, a terminal, debugging, Git integration, plugins, accounts, cloud synchronization, telemetry, or project management.

## 2. Product Goals

- Launch quickly and remain materially lighter than a full IDE.
- Make opening, editing, and saving code files as direct as using Notepad.
- Recognize a document's language from its filename extension and update highlighting immediately after Save As.
- Provide colorful, legible syntax highlighting without making the application chrome visually noisy.
- Behave consistently on supported Windows and Linux distributions.
- Keep all user content and preferences local, with zero required network activity.

## 3. Non-Goals

The first release will not provide:

- Language-server or IntelliSense integration
- Word- or symbol-based autocomplete
- Code execution, tasks, terminals, debuggers, or build tooling
- Git or source-control features
- A folder tree, workspace, or project model
- An extension marketplace or plugin API
- Accounts, cloud storage, collaboration, telemetry, advertising, or update analytics
- macOS and ARM packaging

## 4. Visual Design

### 4.1 Character

PrismPad uses neutral application chrome and concentrates color in syntax tokens. Dark mode uses a near-black graphite editing surface inspired by the approved Prism Ink concept. Light mode uses a warm-white editing surface inspired by Paper Neon. The operating-system theme is used by default, with a manual override in settings.

### 4.2 Layout

The application has four persistent horizontal regions:

1. A compact native-style menu bar
2. A connected document-tab strip
3. The editor canvas, or the welcome screen when no documents are open
4. A thin status bar

There is no sidebar, oversized toolbar, floating-card layout, gradient, glass effect, or rounded pill control.

### 4.3 Tabs

Tabs are connected rectangular document tabs with crisp corners and thin borders. The active tab has a slightly stronger surface and a narrow syntax-accented bottom rule. Each tab displays its filename, a compact close action, and an unsaved-state dot when modified. Tabs can be reordered with drag and drop.

### 4.4 Typography and Color

Menus and interface labels use the operating system's UI font. Editor text uses a bundled open-source monospaced coding font so rendering is predictable across platforms. Syntax colors are vivid but restrained, meet readable contrast targets against both themes, and are never used as the only indication of application state.

## 5. Welcome Experience

When PrismPad starts without restorable open files, it displays:

> **Hello! What will you code in today?**

Below the greeting is a compact searchable list of supported languages, plus **Plain Text** and **Open Existing File**.

Choosing a language creates an untitled document with that language's highlighting enabled immediately. Its first Save dialog suggests the language's primary extension, but the user may select any filename or extension. The welcome view disappears after a language is chosen, typing begins, or an existing file opens.

If the previous session contains clean, path-backed open documents, PrismPad restores those files and tabs instead of showing the welcome screen. Unsaved text is never silently persisted or restored.

## 6. File and Document Behavior

### 6.1 Core Operations

PrismPad supports New, Open, Save, Save As, Close Tab, Close Window, and drag-and-drop file opening. It supports multiple documents in one window and prevents duplicate tabs for the same canonical path.

Untitled documents use plain text until the user selects a language from the welcome screen or saves the document with a recognized extension. Save As always reruns language detection. A changed extension updates highlighting and the status-bar language immediately without reopening the document.

### 6.2 Encoding and Line Endings

New documents use UTF-8 without a byte-order mark. PrismPad detects and preserves a UTF-8 byte-order mark when one is present. Version 1 does not attempt lossy conversion of legacy encodings; an unsupported encoding produces an actionable error and leaves the document unchanged.

Existing files preserve their detected `LF` or `CRLF` line endings. New documents use the host platform's conventional line ending. The current encoding and line-ending mode are visible in the status bar.

### 6.3 Unsaved Work

Modified tabs display an unsaved-state dot. Closing a modified tab prompts to Save, Discard, or Cancel. Closing a window with several modified tabs presents one consolidated list so each document can be saved or discarded before exit. A failed save leaves the tab open and modified.

Session restoration records only canonical paths, tab order, the active tab, and view positions for path-backed files. It does not record document contents. Missing files are skipped on restore and summarized non-disruptively.

### 6.4 External Changes and Safety

PrismPad watches path-backed documents for external changes. If an unmodified document changes on disk, it can reload automatically with a brief notification. If a modified document changes externally, the user chooses Reload From Disk, Compare, or Keep Editor Version. Compare opens a read-only two-pane textual diff without changing either version.

Where supported, saving writes a sibling temporary file and atomically replaces the target. Save errors preserve the original file and the in-memory document.

Files containing a NUL byte in the first 8 KiB are treated as binary and are not opened. Text files larger than 20 MiB display a warning and require confirmation because advanced editor features may be disabled for performance; PrismPad does not freeze or silently truncate content.

## 7. Supported Languages

The initial language registry includes:

| Language | Recognized extensions |
|---|---|
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
| C | `.c`, `.h` |
| C++ | `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh`, `.hxx` |
| Java | `.java` |
| SQL | `.sql` |
| TOML | `.toml` |
| XML | `.xml` |

The language registry is the single source for extension detection, welcome-screen choices, default Save extensions, status labels, and CodeMirror language packages.

## 8. Editing Features

The first release includes:

- Line numbers
- Undo and redo
- Find and replace within the active document
- Auto-indent
- Bracket matching and automatic closing pairs
- Code folding
- Multiple cursors and selections
- Familiar VS Code-style shortcuts where they do not conflict with native platform conventions
- Toggleable word wrap
- Zoom controls and configurable editor font size
- Configurable tab width and spaces-versus-tabs indentation
- Optional indentation guides and visible whitespace
- Drag-and-drop tab reordering
- Markdown preview in a simple editor/preview split

Markdown preview is local, sanitizes generated HTML, does not execute scripts, and does not fetch remote resources automatically.

The status bar shows language, cursor line and column, encoding, line endings, and indentation mode. Clicking an applicable status item opens only the small setting relevant to that item rather than a command palette.

## 9. Architecture

### 9.1 Technology Stack

- **Tauri 2:** desktop shell, operating-system integration, native menus, dialogs, file watching, secure filesystem commands, and packaging
- **Svelte with TypeScript:** application interface and state-bound views
- **CodeMirror 6:** editing surface, document transactions, highlighting, selections, folding, search, and language packages
- **Rust:** restricted native commands for file I/O, metadata, canonical paths, atomic saves, and file watching

The webview does not receive unrestricted filesystem access. Every native command accepts the minimum required arguments and validates paths and operation state.

### 9.2 Components

- **Application shell:** menus, window lifecycle, theme initialization, and command routing
- **Welcome view:** greeting, searchable language list, plain-text creation, and open-file action
- **Document manager:** tab identity, order, active document, file path, editor state, dirty state, disk metadata, and session-safe metadata
- **Editor view:** one mounted CodeMirror editor synchronized with the active document's retained editor state
- **Tab strip:** rectangular connected tabs, dirty indicators, closing, activation, and reordering
- **Language registry:** extensions, display names, default suffixes, and lazy-loaded CodeMirror language support
- **File service:** validated open, save, Save As, atomic replacement, encoding checks, line endings, and external-change events
- **Settings service:** schema-versioned local preferences with validated defaults
- **Markdown preview:** sanitized, local-only rendering
- **Status bar:** document and cursor metadata with narrow contextual controls

Each component exposes a focused interface. UI components do not perform direct filesystem operations, and the file service does not manage presentation state.

### 9.3 Data Flow

Opening a file follows this sequence:

1. The UI requests an Open dialog through Tauri.
2. The Rust file service validates and reads the selected text file and returns content plus metadata.
3. The language registry maps the filename to a language configuration.
4. The document manager creates or activates the corresponding tab and editor state.
5. The editor view renders the document; the status bar reflects its metadata.

Saving follows the inverse boundary: the document manager supplies content and expected disk metadata to the file service, the file service detects conflicts and writes safely, and only a confirmed successful write clears the dirty state.

## 10. Settings and Local State

Settings include:

- Theme: system, light, or dark
- Editor font size
- Word wrap
- Tab width
- Spaces or tabs
- Indentation guides
- Visible whitespace
- Automatic reload of externally changed, unmodified files

Settings and session metadata use separate schema-versioned local files. Invalid or newer unknown fields are ignored safely; corrupt settings fall back to defaults with a non-blocking notice. User document contents are never stored in settings, caches, analytics, or session files.

## 11. Error Handling

- Open and save failures use concise, actionable messages and never close the affected document.
- Unsupported encodings and binary files are rejected without displaying corrupted content.
- External write conflicts are resolved explicitly before overwriting.
- A failed session restore does not block startup.
- A failed language-package load falls back to plain text while preserving all content.
- A Markdown preview failure affects only the preview pane, not the source document.
- Unhandled interface errors display a recoverable fallback view while retaining document states in memory whenever possible.

## 12. Accessibility and Keyboard Use

All core operations are keyboard accessible. Focus states are visible in both themes. Controls have accessible names, and syntax color is supplemental rather than the sole carrier of state. Interface text and essential controls target WCAG 2.2 AA contrast. Reduced-motion preferences disable nonessential transitions.

## 13. Testing Strategy

### 13.1 Unit Tests

Unit tests cover:

- Extension-to-language mapping and default suffixes
- Document identity, tab ordering, dirty state, and close decisions
- Encoding and line-ending detection and preservation
- Settings validation and migration
- Session metadata serialization
- External-change decision logic

### 13.2 Component Tests

Component tests cover:

- Welcome-screen language selection and filtering
- Theme initialization and switching
- Rectangular tab activation, close behavior, reordering, and dirty indicators
- Menu and keyboard command routing
- Status-bar updates
- Markdown preview isolation

### 13.3 End-to-End Tests

End-to-end tests on Windows and Linux cover:

- Startup with and without a restorable session
- New document creation from a welcome-screen language
- Open, edit, Save, and Save As
- Immediate syntax-mode changes after an extension change
- Drag-and-drop opening
- Multi-tab close protection
- External file changes and conflicts
- Line-ending preservation
- Settings persistence
- Installer and packaged-application launch

### 13.4 Release Checks

Release candidates are checked for startup latency, idle memory use, installer size and behavior, large-file responsiveness, keyboard-only operation, and absence of unexpected network traffic. Exact performance budgets will be established from the first functional baseline rather than guessed before measurement.

## 14. Acceptance Criteria

Version 1 is ready when:

1. A user can install and launch PrismPad on 64-bit Windows 10/11 and 64-bit Ubuntu 24.04 LTS or newer.
2. Startup with no restorable files shows the approved greeting and language choices.
3. A selected language gives an untitled file immediate highlighting and the correct suggested extension on first save.
4. A user can open, edit, save, Save As, reorder, and close multiple tabbed documents without data loss.
5. Saving under a different recognized extension immediately changes the language mode.
6. Both approved light and dark themes are complete, readable, and use connected rectangular tabs.
7. All editing features in Section 8 work without autocomplete or IDE-only systems appearing.
8. Session restoration restores only path-backed file metadata and never silently persists unsaved contents.
9. Expected file, encoding, external-change, and save failures are recoverable and preserve in-memory edits.
10. Automated tests pass on Windows and Linux, and release checks show no unexpected network activity.

## 15. Delivery Sequence

Implementation planning should divide the work into independently verifiable stages:

1. Repository and Tauri/Svelte foundation
2. Theme tokens, shell layout, tab strip, and welcome view
3. CodeMirror document model and editing behavior
4. Rust file service and safe open/save flows
5. Language registry and lazy-loaded highlighting
6. Settings, sessions, external-change handling, and Markdown preview
7. Accessibility, packaging, automated tests, and measured performance refinement

This sequence is descriptive only. The implementation plan will define exact tasks, files, commands, and verification checkpoints after this specification is approved.
