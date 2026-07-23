# PrismPad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PrismPad v1 as a lightweight, local-first Windows and Linux code-aware text editor with connected tabs, extension-driven highlighting, safe file handling, and no IDE or autocomplete features.

**Architecture:** A Tauri 2 Rust shell owns validated filesystem operations, file watching, native dialogs, settings, and packaging. A Svelte 5 TypeScript interface owns presentation and document state, while CodeMirror 6 owns editor state and language support; the boundary is a small typed command adapter rather than broad filesystem permissions.

**Tech Stack:** Rust, Tauri 2, Svelte 5, TypeScript 6, Vite 8, CodeMirror 6, Vitest 4, Testing Library, WebdriverIO 9, npm, GitHub Actions

## Global Constraints

- Official v1 targets are 64-bit Windows 10/11 and 64-bit Ubuntu 24.04 LTS or newer.
- Linux artifacts are a Debian package and AppImage; Windows artifacts use the Tauri NSIS installer.
- Runtime behavior is local-only: no accounts, telemetry, cloud synchronization, advertising, or required network requests.
- The editor has no autocomplete, language server, code execution, terminal, debugger, Git UI, plugin system, folder tree, workspace model, or command palette.
- UI uses light and dark themes, connected rectangular tabs, neutral chrome, vivid syntax colors, and the exact greeting `Hello! What will you code in today?`.
- Session persistence may contain file paths, tab order, active tab, and view positions, but never document contents.
- New files use UTF-8 without BOM; existing UTF-8 BOM and `LF`/`CRLF` styles are preserved.
- JavaScript dependencies are pinned to exact versions in `package.json`; Rust and JavaScript lockfiles are committed.
- Every behavior change begins with a failing test and ends with the narrow test, the complete suite, and a focused commit.

---

## Planned File Structure

| Path | Responsibility |
|---|---|
| `package.json` | Exact scripts and JavaScript dependency versions |
| `vite.config.ts`, `tsconfig.json`, `index.html` | Svelte/Vite build and test entry configuration |
| `src/main.ts`, `src/App.svelte`, `src/app.css` | Application entry, top-level composition, and design tokens |
| `src/lib/domain/document.ts` | Stable document, disk metadata, and close-decision types |
| `src/lib/domain/languages.ts` | Single extension/language/default-suffix registry |
| `src/lib/stores/documents.svelte.ts` | Document/tab state and dirty-state transitions |
| `src/lib/stores/preferences.svelte.ts` | Validated settings state and system-theme resolution |
| `src/lib/native/file-api.ts` | Typed Tauri command and dialog adapter |
| `src/lib/native/store-api.ts` | Schema-versioned preferences and safe session metadata |
| `src/lib/editor/create-editor.ts` | CodeMirror lifecycle and document-state switching |
| `src/lib/editor/extensions.ts` | Non-autocomplete editing extensions and language loading |
| `src/lib/editor/themes.ts` | PrismPad light/dark CodeMirror themes |
| `src/lib/components/WelcomeView.svelte` | Greeting, language search, and open-existing action |
| `src/lib/components/TabStrip.svelte` | Connected tabs, dirty markers, close, and reorder |
| `src/lib/components/EditorPane.svelte` | Mounted editor host and active-document binding |
| `src/lib/components/StatusBar.svelte` | Cursor, language, encoding, line-ending, and indent state |
| `src/lib/components/FindPanel.svelte` | Find/replace controls bound to CodeMirror search commands |
| `src/lib/components/MarkdownPreview.svelte` | Sanitized local Markdown preview |
| `src/lib/components/ExternalChangeDialog.svelte` | Reload, compare, or keep decision |
| `src/lib/components/UnsavedDialog.svelte` | One- and multi-document close protection |
| `src-tauri/src/files.rs` | UTF-8 validation, binary guard, read, and atomic write |
| `src-tauri/src/watch.rs` | Debounced file-watch lifecycle and Tauri events |
| `src-tauri/src/lib.rs`, `src-tauri/src/main.rs` | Tauri builder, commands, plugins, and window lifecycle |
| `src-tauri/tauri.conf.json` | Application identity, build, bundle targets, and CSP |
| `src-tauri/capabilities/default.json` | Minimal dialog, store, and window permissions |
| `tests/` | Vitest unit and Svelte component tests |
| `e2e/` | WebdriverIO packaged-application workflows |
| `.github/workflows/ci.yml` | Windows/Linux checks, tests, and package builds |
| `README.md` | Supported systems, feature scope, development, tests, and install instructions |

---

### Task 1: Bootstrap the Tauri/Svelte Testable Shell

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/App.svelte`
- Create: `src/app.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `tests/setup.ts`
- Create: `tests/app-shell.test.ts`

**Interfaces:**
- Consumes: None; repository contains only the approved design and this plan.
- Produces: `App.svelte`, a runnable `prism-pad` Tauri binary, `npm run check`, `npm test`, and `npm run tauri build -- --debug`.

- [ ] **Step 1: Add a failing application-shell test**

```ts
// tests/app-shell.test.ts
import { render, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';

it('renders the PrismPad shell without IDE panels', () => {
  render(App);
  expect(screen.getByRole('application', { name: 'PrismPad' })).toBeInTheDocument();
  expect(screen.queryByText('Terminal')).not.toBeInTheDocument();
  expect(screen.queryByText('Explorer')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add exact package and test configuration, then verify the test fails before `App.svelte` exists**

```json
{
  "name": "prismpad",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri"
  },
  "dependencies": {
    "@codemirror/commands": "6.10.4",
    "@codemirror/lang-cpp": "6.0.3",
    "@codemirror/lang-css": "6.3.1",
    "@codemirror/lang-html": "6.4.11",
    "@codemirror/lang-java": "6.0.2",
    "@codemirror/lang-javascript": "6.2.5",
    "@codemirror/lang-json": "6.0.2",
    "@codemirror/lang-markdown": "6.5.1",
    "@codemirror/lang-python": "6.2.1",
    "@codemirror/lang-rust": "6.0.2",
    "@codemirror/lang-sql": "6.10.0",
    "@codemirror/lang-xml": "6.1.0",
    "@codemirror/lang-yaml": "6.1.3",
    "@codemirror/language": "6.12.4",
    "@codemirror/legacy-modes": "6.5.3",
    "@codemirror/merge": "6.12.2",
    "@codemirror/search": "6.7.1",
    "@codemirror/state": "6.7.1",
    "@codemirror/view": "6.43.6",
    "@fontsource-variable/jetbrains-mono": "5.3.0",
    "@tauri-apps/api": "2.11.1",
    "@tauri-apps/plugin-dialog": "2.7.2",
    "@tauri-apps/plugin-store": "2.4.4",
    "dompurify": "3.4.12",
    "marked": "18.0.7",
    "svelte": "5.56.7"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "7.2.0",
    "@tauri-apps/cli": "2.11.4",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/svelte": "5.4.2",
    "jsdom": "29.1.1",
    "svelte-check": "4.7.3",
    "typescript": "6.0.3",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

Run: `npm install && npm test -- tests/app-shell.test.ts`  
Expected: FAIL because `src/App.svelte` cannot be resolved.

- [ ] **Step 3: Implement the minimal shell and Tauri entry**

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  const appName = 'PrismPad';
</script>

<main class="app-shell" role="application" aria-label={appName}>
  <section class="workspace" aria-live="polite"></section>
</main>
```

```rust
// src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("PrismPad failed to start");
}
```

```rust
// src-tauri/src/main.rs
fn main() {
    prism_pad_lib::run();
}
```

Create `src/main.ts` with the exact startup sequence below, set Vite's test environment to `jsdom` with `tests/setup.ts`, and configure Tauri identity as `com.vesperengineering.prismpad` with product name `PrismPad`, `frontendDist: ../dist`, `devUrl: http://localhost:1420`, NSIS, DEB, and AppImage bundle targets.

```ts
// src/main.ts
import '@fontsource-variable/jetbrains-mono';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

mount(App, { target: document.getElementById('app')! });
```

Use these Rust dependencies and commit the resolved `Cargo.lock`:

```toml
[dependencies]
notify = "8"
notify-debouncer-mini = "0.7"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-store = "2"
tempfile = "3"
thiserror = "2"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

- [ ] **Step 4: Verify the shell and native crate**

Run: `npm test -- tests/app-shell.test.ts && npm run check && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`  
Expected: all commands exit 0; Vitest reports 1 passing test.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src src-tauri tests
git commit -m "chore: bootstrap PrismPad desktop shell"
```

---

### Task 2: Define the Language Registry and Welcome Selection

**Files:**
- Create: `src/lib/domain/languages.ts`
- Create: `src/lib/components/WelcomeView.svelte`
- Create: `tests/languages.test.ts`
- Create: `tests/welcome-view.test.ts`

**Interfaces:**
- Consumes: Svelte test harness from Task 1.
- Produces: `LanguageId`, `LanguageDefinition`, `LANGUAGES`, `languageForPath(path)`, and `defaultSuffixFor(id)`; `WelcomeView` dispatches `selectLanguage` with a `LanguageId` or `openExisting`.

- [ ] **Step 1: Write failing registry tests**

```ts
// tests/languages.test.ts
import { defaultSuffixFor, languageForPath } from '../src/lib/domain/languages';

it.each([
  ['script.PY', 'python'], ['README.md', 'markdown'], ['config.yml', 'yaml'],
  ['worker.psm1', 'powershell'], ['main.cpp', 'cpp'], ['unknown.binlog', 'plain']
])('maps %s to %s', (path, expected) => {
  expect(languageForPath(path).id).toBe(expected);
});

it('returns the primary suffix used by first save', () => {
  expect(defaultSuffixFor('python')).toBe('.py');
  expect(defaultSuffixFor('typescript')).toBe('.ts');
});
```

- [ ] **Step 2: Run the registry test to verify failure**

Run: `npm test -- tests/languages.test.ts`  
Expected: FAIL because `src/lib/domain/languages.ts` does not exist.

- [ ] **Step 3: Implement one immutable registry**

```ts
// src/lib/domain/languages.ts
export type LanguageId = 'plain' | 'python' | 'markdown' | 'yaml' | 'json' |
  'javascript' | 'typescript' | 'jsx' | 'tsx' | 'html' | 'css' | 'shell' |
  'powershell' | 'rust' | 'c' | 'cpp' | 'java' | 'sql' | 'toml' | 'xml';

export type LanguageDefinition = Readonly<{
  id: LanguageId;
  label: string;
  extensions: readonly string[];
  defaultSuffix: string;
}>;

export const LANGUAGES: readonly LanguageDefinition[] = [
  { id: 'plain', label: 'Plain Text', extensions: ['.txt'], defaultSuffix: '.txt' },
  { id: 'python', label: 'Python', extensions: ['.py', '.pyw'], defaultSuffix: '.py' },
  { id: 'markdown', label: 'Markdown', extensions: ['.md', '.markdown'], defaultSuffix: '.md' },
  { id: 'yaml', label: 'YAML', extensions: ['.yaml', '.yml'], defaultSuffix: '.yaml' },
  { id: 'json', label: 'JSON', extensions: ['.json', '.jsonc'], defaultSuffix: '.json' },
  { id: 'javascript', label: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'], defaultSuffix: '.js' },
  { id: 'typescript', label: 'TypeScript', extensions: ['.ts', '.mts', '.cts'], defaultSuffix: '.ts' },
  { id: 'jsx', label: 'JSX', extensions: ['.jsx'], defaultSuffix: '.jsx' },
  { id: 'tsx', label: 'TSX', extensions: ['.tsx'], defaultSuffix: '.tsx' },
  { id: 'html', label: 'HTML', extensions: ['.html', '.htm'], defaultSuffix: '.html' },
  { id: 'css', label: 'CSS', extensions: ['.css'], defaultSuffix: '.css' },
  { id: 'shell', label: 'Shell', extensions: ['.sh', '.bash', '.zsh'], defaultSuffix: '.sh' },
  { id: 'powershell', label: 'PowerShell', extensions: ['.ps1', '.psm1', '.psd1'], defaultSuffix: '.ps1' },
  { id: 'rust', label: 'Rust', extensions: ['.rs'], defaultSuffix: '.rs' },
  { id: 'c', label: 'C', extensions: ['.c', '.h'], defaultSuffix: '.c' },
  { id: 'cpp', label: 'C++', extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'], defaultSuffix: '.cpp' },
  { id: 'java', label: 'Java', extensions: ['.java'], defaultSuffix: '.java' },
  { id: 'sql', label: 'SQL', extensions: ['.sql'], defaultSuffix: '.sql' },
  { id: 'toml', label: 'TOML', extensions: ['.toml'], defaultSuffix: '.toml' },
  { id: 'xml', label: 'XML', extensions: ['.xml'], defaultSuffix: '.xml' }
] as const;

const PLAIN = LANGUAGES[0];
export const languageForPath = (path: string): LanguageDefinition => {
  const lower = path.toLowerCase();
  return LANGUAGES.find((language) => language.extensions.some((suffix) => lower.endsWith(suffix))) ?? PLAIN;
};
export const defaultSuffixFor = (id: LanguageId): string =>
  LANGUAGES.find((language) => language.id === id)?.defaultSuffix ?? '.txt';
```

- [ ] **Step 4: Write and satisfy welcome-view interaction tests**

```ts
// tests/welcome-view.test.ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import WelcomeView from '../src/lib/components/WelcomeView.svelte';

it('filters languages and selects Python', async () => {
  const onSelect = vi.fn();
  render(WelcomeView, { onSelect, onOpenExisting: vi.fn() });
  expect(screen.getByText('Hello! What will you code in today?')).toBeInTheDocument();
  await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'pyt' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Python' }));
  expect(onSelect).toHaveBeenCalledWith('python');
});
```

Implement `WelcomeView.svelte` with exported callback props `onSelect(id: LanguageId)` and `onOpenExisting()`, a labeled search input, filtered `LANGUAGES`, and semantic buttons for every result.

Run: `npm test -- tests/languages.test.ts tests/welcome-view.test.ts`  
Expected: all registry cases and welcome interactions pass.

- [ ] **Step 5: Commit the language-first welcome model**

```bash
git add src/lib/domain/languages.ts src/lib/components/WelcomeView.svelte tests/languages.test.ts tests/welcome-view.test.ts
git commit -m "feat: add language registry and welcome chooser"
```

---

### Task 3: Implement the Multi-Document State Model

**Files:**
- Create: `src/lib/domain/document.ts`
- Create: `src/lib/stores/documents.svelte.ts`
- Create: `tests/documents.test.ts`

**Interfaces:**
- Consumes: `LanguageId` and `languageForPath` from Task 2.
- Produces: `DocumentRecord`, `DiskMetadata`, `DocumentStore`, `createUntitled(language)`, `openPath(payload)`, `applyEdit(id, text)`, `markSaved(id, result)`, `activate(id)`, `reorder(source, target)`, and `remove(id)`.

- [ ] **Step 1: Write failing state-transition tests**

```ts
// tests/documents.test.ts
import { createDocumentStore } from '../src/lib/stores/documents.svelte';

it('creates, edits, reorders, and saves documents without losing identity', () => {
  const store = createDocumentStore(() => 'fixed-id');
  const id = store.createUntitled('python');
  store.applyEdit(id, 'print("hi")\n');
  expect(store.get(id)?.dirty).toBe(true);
  store.markSaved(id, { path: '/tmp/hello.py', modifiedMs: 10, size: 12 });
  expect(store.get(id)).toMatchObject({ path: '/tmp/hello.py', language: 'python', dirty: false });
});

it('activates an existing canonical path instead of duplicating it', () => {
  const store = createDocumentStore(() => crypto.randomUUID());
  const first = store.openPath({ path: '/tmp/a.md', text: '# A\n', encoding: 'utf-8', bom: false, lineEnding: 'lf', modifiedMs: 1, size: 4 });
  const second = store.openPath({ path: '/tmp/a.md', text: '# A\n', encoding: 'utf-8', bom: false, lineEnding: 'lf', modifiedMs: 1, size: 4 });
  expect(second).toBe(first);
  expect(store.snapshot().documents).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to establish RED**

Run: `npm test -- tests/documents.test.ts`  
Expected: FAIL because the document types and store do not exist.

- [ ] **Step 3: Implement explicit document types and immutable snapshots**

```ts
// src/lib/domain/document.ts
import type { LanguageId } from './languages';

export type LineEnding = 'lf' | 'crlf';
export type TextEncoding = 'utf-8';
export type DiskMetadata = Readonly<{ path: string; modifiedMs: number; size: number }>;
export type OpenFilePayload = DiskMetadata & Readonly<{
  text: string; encoding: TextEncoding; bom: boolean; lineEnding: LineEnding; large: boolean;
}>;
export type DocumentRecord = Readonly<{
  id: string; title: string; path: string | null; text: string; savedText: string;
  language: LanguageId; encoding: TextEncoding; bom: boolean; lineEnding: LineEnding;
  modifiedMs: number | null; size: number; dirty: boolean; anchor: number; head: number;
}>;
export type DocumentSnapshot = Readonly<{ documents: readonly DocumentRecord[]; activeId: string | null }>;
export type DocumentStore = Readonly<{
  snapshot(): DocumentSnapshot;
  get(id: string): DocumentRecord | undefined;
  createUntitled(language: LanguageId): string;
  openPath(payload: OpenFilePayload): string;
  applyEdit(id: string, text: string): void;
  markSaved(id: string, metadata: DiskMetadata): void;
  activate(id: string): void;
  reorder(sourceId: string, targetId: string): void;
  remove(id: string): void;
}>;
```

Implement `createDocumentStore(idFactory = crypto.randomUUID)` with private mutable state, readonly cloned snapshots, basename-derived titles, canonical-path de-duplication, and `dirty: text !== savedText`. `markSaved` updates path, title, language, disk metadata, `savedText`, and `dirty` in one transaction.

- [ ] **Step 4: Verify all state transitions**

Run: `npm test -- tests/documents.test.ts && npm test`  
Expected: document tests pass and the full Vitest suite remains green.

- [ ] **Step 5: Commit the document model**

```bash
git add src/lib/domain/document.ts src/lib/stores/documents.svelte.ts tests/documents.test.ts
git commit -m "feat: add multi-document state model"
```

---

### Task 4: Build the Approved Shell, Themes, Welcome View, and Rectangular Tabs

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/app.css`
- Create: `src/lib/components/TabStrip.svelte`
- Create: `tests/tab-strip.test.ts`
- Modify: `tests/app-shell.test.ts`

**Interfaces:**
- Consumes: `DocumentSnapshot` and `WelcomeView` from Tasks 2-3.
- Produces: top-level visual shell and `TabStrip` callbacks `onActivate(id)`, `onClose(id)`, and `onReorder(sourceId, targetId)`.

- [ ] **Step 1: Write failing visual-behavior tests**

```ts
// tests/tab-strip.test.ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import TabStrip from '../src/lib/components/TabStrip.svelte';

const documents = [
  { id: 'a', title: 'app.py', dirty: true },
  { id: 'b', title: 'README.md', dirty: false }
];

it('renders connected tabs and exposes activate and close actions', async () => {
  const onActivate = vi.fn();
  const onClose = vi.fn();
  render(TabStrip, { documents, activeId: 'a', onActivate, onClose, onReorder: vi.fn() });
  expect(screen.getByRole('tab', { name: /app.py/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('tab-a')).toHaveClass('is-dirty');
  await fireEvent.click(screen.getByRole('button', { name: 'Close app.py' }));
  expect(onClose).toHaveBeenCalledWith('a');
});
```

- [ ] **Step 2: Verify the tab test fails**

Run: `npm test -- tests/tab-strip.test.ts`  
Expected: FAIL because `TabStrip.svelte` does not exist.

- [ ] **Step 3: Implement semantic connected tabs and theme tokens**

```css
/* required core tokens in src/app.css */
:root {
  color-scheme: light;
  --chrome: #ecebe7; --surface: #fffdf8; --surface-strong: #ffffff;
  --text: #202124; --muted: #6f7177; --border: #c9c8c3; --accent: #245dff;
  --syntax-keyword: #d62445; --syntax-string: #92278f; --syntax-function: #005fba;
}
[data-theme='dark'] {
  color-scheme: dark;
  --chrome: #15181b; --surface: #0d1012; --surface-strong: #191d21;
  --text: #f1eee8; --muted: #9ba0a6; --border: #343a40; --accent: #ff727f;
  --syntax-keyword: #ff7b87; --syntax-string: #d7a8ff; --syntax-function: #69d5e7;
}
.tab-strip { display: flex; border-bottom: 1px solid var(--border); background: var(--chrome); }
.document-tab { border: 0; border-right: 1px solid var(--border); border-radius: 0; background: transparent; }
.document-tab[aria-selected='true'] { background: var(--surface-strong); box-shadow: inset 0 -2px var(--accent); }
```

Implement `TabStrip.svelte` as a `role="tablist"` with keyboard focus, rectangular `role="tab"` buttons, separate labeled close buttons, dirty dots, and HTML drag events that call `onReorder` only for valid document IDs. Compose `App.svelte` so the welcome view appears only when the document snapshot is empty.

- [ ] **Step 4: Verify behavior and static checks**

Run: `npm test -- tests/tab-strip.test.ts tests/app-shell.test.ts && npm run check`  
Expected: tests pass; Svelte reports zero errors.

- [ ] **Step 5: Commit the approved visual shell**

```bash
git add src/App.svelte src/app.css src/lib/components/TabStrip.svelte tests/tab-strip.test.ts tests/app-shell.test.ts
git commit -m "feat: build PrismPad shell and connected tabs"
```

---

### Task 5: Integrate CodeMirror Without Autocomplete

**Files:**
- Create: `src/lib/editor/extensions.ts`
- Create: `src/lib/editor/themes.ts`
- Create: `src/lib/editor/create-editor.ts`
- Create: `src/lib/components/EditorPane.svelte`
- Create: `src/lib/components/FindPanel.svelte`
- Create: `tests/editor-extensions.test.ts`
- Create: `tests/editor-pane.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `DocumentRecord`, `LanguageId`, document-store edit and cursor callbacks.
- Produces: `loadLanguage(id): Promise<Extension>`, `prismPadExtensions(options)`, `createPrismEditor(options)`, `replaceDocument(record)`, `focus()`, and `destroy()`.

- [ ] **Step 1: Write a failing test that forbids autocomplete**

```ts
// tests/editor-extensions.test.ts
import { EditorState } from '@codemirror/state';
import { prismPadExtensions } from '../src/lib/editor/extensions';

it('provides editing fundamentals without an autocomplete source', () => {
  const state = EditorState.create({ doc: 'const value = 1;\n', extensions: prismPadExtensions({ language: 'javascript', dark: true }) });
  expect(state.facet(EditorState.allowMultipleSelections)).toBe(true);
  expect(document.querySelector('.cm-tooltip-autocomplete')).toBeNull();
});
```

- [ ] **Step 2: Run the editor test to verify RED**

Run: `npm test -- tests/editor-extensions.test.ts`  
Expected: FAIL because the extension factory does not exist.

- [ ] **Step 3: Implement editing and lazy language extensions**

```ts
// src/lib/editor/extensions.ts
import { EditorState, type Extension } from '@codemirror/state';
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import {
  crosshairCursor, drawSelection, dropCursor, EditorView, highlightActiveLine,
  highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers,
  rectangularSelection
} from '@codemirror/view';
import type { LanguageId } from '../domain/languages';

export async function loadLanguage(id: LanguageId): Promise<Extension> {
  switch (id) {
    case 'python': return (await import('@codemirror/lang-python')).python();
    case 'markdown': return (await import('@codemirror/lang-markdown')).markdown();
    case 'yaml': return (await import('@codemirror/lang-yaml')).yaml();
    case 'json': return (await import('@codemirror/lang-json')).json();
    case 'javascript': return (await import('@codemirror/lang-javascript')).javascript();
    case 'typescript': return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'jsx': return (await import('@codemirror/lang-javascript')).javascript({ jsx: true });
    case 'tsx': return (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true });
    case 'html': return (await import('@codemirror/lang-html')).html();
    case 'css': return (await import('@codemirror/lang-css')).css();
    case 'rust': return (await import('@codemirror/lang-rust')).rust();
    case 'c': case 'cpp': return (await import('@codemirror/lang-cpp')).cpp();
    case 'java': return (await import('@codemirror/lang-java')).java();
    case 'sql': return (await import('@codemirror/lang-sql')).sql();
    case 'xml': return (await import('@codemirror/lang-xml')).xml();
    case 'shell': {
      const [{ StreamLanguage }, { shell }] = await Promise.all([
        import('@codemirror/language'), import('@codemirror/legacy-modes/mode/shell')
      ]);
      return StreamLanguage.define(shell);
    }
    case 'powershell': {
      const [{ StreamLanguage }, { powerShell }] = await Promise.all([
        import('@codemirror/language'), import('@codemirror/legacy-modes/mode/powershell')
      ]);
      return StreamLanguage.define(powerShell);
    }
    case 'toml': {
      const [{ StreamLanguage }, { toml }] = await Promise.all([
        import('@codemirror/language'), import('@codemirror/legacy-modes/mode/toml')
      ]);
      return StreamLanguage.define(toml);
    }
    default: return [];
  }
}

export const prismPadExtensions = ({ dark }: { language: LanguageId; dark: boolean }): Extension[] => [
  lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(),
  drawSelection(), dropCursor(), rectangularSelection(), crosshairCursor(), highlightActiveLine(),
  highlightSelectionMatches(), indentOnInput(), bracketMatching(), closeBrackets(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  EditorState.allowMultipleSelections.of(true),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
  EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'JetBrains Mono Variable, monospace' } }, { dark })
];
```

Add PrismPad light/dark `HighlightStyle` definitions in `themes.ts`; do not import `@codemirror/autocomplete`, `basicSetup`, or include `autocompletion()`. Manage wrapping, tab width, indentation unit, whitespace, theme, and language in named `Compartment` instances so preference changes reconfigure the mounted editor without destroying history.

- [ ] **Step 4: Implement editor lifecycle and verify document switching**

`createPrismEditor` creates one `EditorView`, retains an `EditorState` per document ID, emits text/cursor changes, switches states without recreating the DOM, uses named `Compartment` values for language/theme/wrap/indent reconfiguration, and destroys all subscriptions on component teardown. Catch a rejected language import, install the plain-text extension, preserve the document, and emit one non-blocking `Syntax highlighting could not be loaded; using Plain Text.` notice.

Run: `npm test -- tests/editor-extensions.test.ts tests/editor-pane.test.ts && npm run check`  
Expected: editing tests pass; searching the source for `autocompletion(` returns no matches.

- [ ] **Step 5: Commit the editor core**

```bash
git add src/lib/editor src/lib/components/EditorPane.svelte src/lib/components/FindPanel.svelte src/App.svelte tests/editor-extensions.test.ts tests/editor-pane.test.ts
git commit -m "feat: add CodeMirror editing core"
```

---

### Task 6: Implement Safe Native Read and Atomic Save

**Files:**
- Create: `src-tauri/src/files.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Create: `src/lib/native/file-api.ts`
- Create: `tests/file-api.test.ts`

**Interfaces:**
- Consumes: `OpenFilePayload`, `DiskMetadata`, `LineEnding`, and Tauri `invoke`.
- Produces Rust commands `read_text_file(path) -> ReadFileResult` and `write_text_file(request) -> WriteFileResult`; TypeScript functions `openFile(path)` and `saveFile(request)`.

- [ ] **Step 1: Write failing Rust tests for BOM, line endings, binary files, and atomic writes**

```rust
// bottom of src-tauri/src/files.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_utf8_bom_and_crlf() {
        let parsed = parse_text(&[0xEF, 0xBB, 0xBF, b'a', b'\r', b'\n']).unwrap();
        assert!(parsed.bom);
        assert_eq!(parsed.line_ending, LineEnding::Crlf);
        assert_eq!(parsed.text, "a\r\n");
    }

    #[test]
    fn rejects_nul_in_first_eight_kibibytes() {
        assert!(matches!(parse_text(b"abc\0def"), Err(FileError::Binary)));
    }

    #[test]
    fn round_trip_preserves_bom_and_crlf() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sample.txt");
        atomic_write(&path, "a\nb\n", true, LineEnding::Crlf).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"\xEF\xBB\xBFa\r\nb\r\n");
    }
}
```

- [ ] **Step 2: Run the Rust test to verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml files::tests`  
Expected: FAIL because `files.rs` and its types are absent.

- [ ] **Step 3: Implement validated filesystem commands**

```rust
// core public types in src-tauri/src/files.rs
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding { Lf, Crlf }

#[derive(Debug, thiserror::Error)]
pub enum FileError {
    #[error("This appears to be a binary file and cannot be opened as text.")] Binary,
    #[error("PrismPad v1 supports UTF-8 text files only.")] UnsupportedEncoding,
    #[error("The file changed on disk after it was opened.")] Conflict,
    #[error("File operation failed: {0}")] Io(String),
}

pub struct ParsedText { pub text: String, pub bom: bool, pub line_ending: LineEnding }

pub fn parse_text(bytes: &[u8]) -> Result<ParsedText, FileError> {
    if bytes.iter().take(8192).any(|byte| *byte == 0) { return Err(FileError::Binary); }
    let (bom, body) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { (true, &bytes[3..]) } else { (false, bytes) };
    let text = std::str::from_utf8(body).map_err(|_| FileError::UnsupportedEncoding)?.to_owned();
    let line_ending = if text.contains("\r\n") { LineEnding::Crlf } else { LineEnding::Lf };
    Ok(ParsedText { text, bom, line_ending })
}
```

Implement canonical-path validation, metadata timestamps, expected-modified-time conflict checks, sibling `NamedTempFile`, flush plus `sync_all`, permission preservation, and atomic persist. Before writing, normalize `\r\n` and lone `\r` to `\n`, then encode as `LF` or `CRLF` exactly once to avoid doubled carriage returns. `read_text_file(path, allow_large)` reads metadata and at most the first 8 KiB before returning `{ code: "large_file", message, size }` for a file over 20 MiB when `allow_large` is false; after confirmation, the UI repeats with `allow_large: true`. Convert command errors into serializable `{ code, message }` values rather than panicking. Register both commands with `tauri::generate_handler!`.

- [ ] **Step 4: Add and satisfy a mocked TypeScript adapter test**

```ts
// tests/file-api.test.ts
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { openFile } from '../src/lib/native/file-api';

it('uses the restricted read command', async () => {
  vi.mocked(invoke).mockResolvedValue({ path: 'C:\\x.py', text: 'x=1\n', encoding: 'utf-8', bom: false, lineEnding: 'lf', modifiedMs: 7, size: 4, large: false });
  await expect(openFile('C:\\x.py')).resolves.toMatchObject({ path: 'C:\\x.py', lineEnding: 'lf' });
  expect(invoke).toHaveBeenCalledWith('read_text_file', { path: 'C:\\x.py', allowLarge: false });
});
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml && npm test -- tests/file-api.test.ts`  
Expected: Rust and adapter tests pass.

- [ ] **Step 5: Commit the safe file boundary**

```bash
git add src-tauri/src/files.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src/lib/native/file-api.ts tests/file-api.test.ts
git commit -m "feat: add safe native file operations"
```

---

### Task 7: Connect Open, Save, Save As, Drag-and-Drop, and Extension Changes

**Files:**
- Modify: `src/lib/native/file-api.ts`
- Modify: `src/lib/stores/documents.svelte.ts`
- Modify: `src/App.svelte`
- Create: `src/lib/controllers/document-actions.ts`
- Create: `tests/document-actions.test.ts`

**Interfaces:**
- Consumes: document store, file adapter, language registry, Tauri dialog plugin, and webview drag events.
- Produces: `createDocumentActions(deps)` with `newDocument`, `openDialog`, `openPaths`, `save`, `saveAs`, and `handleDroppedPaths`.

- [ ] **Step 1: Write failing workflow tests**

```ts
// tests/document-actions.test.ts
it('Save As updates path, title, and syntax mode only after a successful write', async () => {
  const documents = createDocumentStore(() => 'doc-1');
  const deps: DocumentActionDeps = {
    documents,
    chooseOpenPaths: async () => [],
    chooseSavePath: async () => '/tmp/tool.py',
    readFile: vi.fn(),
    writeFile: async () => ({ path: '/tmp/tool.py', modifiedMs: 10, size: 9 }),
    confirmLargeFile: async () => true,
    showError: vi.fn()
  };
  const actions = createDocumentActions(deps);
  const id = documents.createUntitled('plain');
  documents.applyEdit(id, 'print(1)\n');
  await actions.saveAs(id);
  expect(documents.get(id)).toMatchObject({ title: 'tool.py', language: 'python', dirty: false });
});

it('keeps a dirty document unchanged after a cancelled dialog', async () => {
  const documents = createDocumentStore(() => 'doc-2');
  const deps: DocumentActionDeps = {
    documents,
    chooseOpenPaths: async () => [],
    chooseSavePath: async () => null,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    confirmLargeFile: async () => true,
    showError: vi.fn()
  };
  const id = documents.createUntitled('markdown');
  documents.applyEdit(id, '# Draft\n');
  await createDocumentActions(deps).save(id);
  expect(documents.get(id)?.dirty).toBe(true);
});
```

- [ ] **Step 2: Verify the workflow tests fail**

Run: `npm test -- tests/document-actions.test.ts`  
Expected: FAIL because `createDocumentActions` is absent.

- [ ] **Step 3: Implement command orchestration with injected dependencies**

```ts
// public shape in src/lib/controllers/document-actions.ts
export type DocumentActionDeps = Readonly<{
  documents: DocumentStore;
  chooseOpenPaths: () => Promise<string[]>;
  chooseSavePath: (suggestedName: string) => Promise<string | null>;
  readFile: (path: string, allowLarge: boolean) => Promise<OpenFilePayload>;
  writeFile: (request: WriteFileRequest) => Promise<DiskMetadata>;
  confirmLargeFile: (path: string, size: number) => Promise<boolean>;
  showError: (message: string) => void;
}>;
```

`saveAs` suggests `Untitled` plus `defaultSuffixFor(document.language)`, and `save` routes untitled documents to `saveAs`. Only `markSaved` after a successful native response. `openPaths` continues opening remaining paths when one fails and activates existing canonical-path tabs. A `large_file` error opens `confirmLargeFile`; acceptance repeats the read once with `allowLarge: true`, and rejection leaves no tab behind. Subscribe once to `getCurrentWebview().onDragDropEvent`, accept only `drop`, and unregister on application teardown.

- [ ] **Step 4: Verify workflows and extension changes**

Run: `npm test -- tests/document-actions.test.ts tests/documents.test.ts tests/languages.test.ts && npm run check`  
Expected: all workflow tests pass, including cancelled dialogs and `.txt` to `.py` language changes.

- [ ] **Step 5: Commit user-facing file workflows**

```bash
git add src/lib/native/file-api.ts src/lib/stores/documents.svelte.ts src/lib/controllers/document-actions.ts src/App.svelte tests/document-actions.test.ts
git commit -m "feat: connect open and save workflows"
```

---

### Task 8: Add Preferences, Safe Session Restoration, and Close Protection

**Files:**
- Create: `src/lib/stores/preferences.svelte.ts`
- Create: `src/lib/native/store-api.ts`
- Create: `src/lib/components/UnsavedDialog.svelte`
- Create: `src/lib/controllers/window-lifecycle.ts`
- Create: `tests/preferences.test.ts`
- Create: `tests/session.test.ts`
- Create: `tests/unsaved-dialog.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: Tauri store plugin, document store, save actions, and window close-request events.
- Produces: `Preferences`, `loadPreferences`, `savePreferences`, `SessionV1`, `serializeSession(snapshot)`, `restoreSession(session)`, and `resolveClose(decisions)`.

- [ ] **Step 1: Write failing settings and session tests**

```ts
// tests/session.test.ts
it('serializes paths and view state but never document contents', () => {
  const session = serializeSession({
    activeId: 'a',
    documents: [{ id: 'a', path: '/tmp/a.py', text: 'secret', anchor: 3, head: 3 }]
  });
  expect(JSON.stringify(session)).not.toContain('secret');
  expect(session.tabs[0]).toEqual({ path: '/tmp/a.py', anchor: 3, head: 3 });
});

// tests/preferences.test.ts
it('falls back field-by-field when stored settings are corrupt', () => {
  expect(validatePreferences({ theme: 'laser', tabWidth: 0, wordWrap: false })).toEqual({
    theme: 'system', fontSize: 14, wordWrap: false, tabWidth: 4,
    indentStyle: 'spaces', indentationGuides: true, visibleWhitespace: false,
    autoReloadCleanFiles: true
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/preferences.test.ts tests/session.test.ts`  
Expected: FAIL because the settings and session APIs do not exist.

- [ ] **Step 3: Implement schema-versioned local state**

```ts
export type Preferences = Readonly<{
  theme: 'system' | 'light' | 'dark'; fontSize: number; wordWrap: boolean;
  tabWidth: 2 | 4 | 8; indentStyle: 'spaces' | 'tabs'; indentationGuides: boolean;
  visibleWhitespace: boolean; autoReloadCleanFiles: boolean;
}>;

export type SessionV1 = Readonly<{
  version: 1; activePath: string | null;
  tabs: readonly Readonly<{ path: string; anchor: number; head: number }>[];
}>;
```

Persist settings to `preferences.json` and sessions to `session.json` through separate Tauri stores. Validate every preference independently. Resolve `theme: 'system'` with `matchMedia('(prefers-color-scheme: dark)')` and remove its change listener on teardown. Restore tabs sequentially through `readFile`; skip missing/unreadable paths and return a summary. Persist a session only after filtering out untitled documents and never serialize `text` or `savedText`.

- [ ] **Step 4: Implement and test consolidated close protection**

`UnsavedDialog.svelte` lists every dirty filename with `Save`, `Discard`, and `Cancel` decisions. `window-lifecycle.ts` prevents the native close event, performs requested saves sequentially, aborts on cancel or save failure, persists the safe session, then closes using an internal `allowClose` guard to prevent recursion.

Run: `npm test -- tests/preferences.test.ts tests/session.test.ts tests/unsaved-dialog.test.ts && npm run check`  
Expected: tests pass; session snapshots contain no document contents.

- [ ] **Step 5: Commit local settings and lifecycle safety**

```bash
git add src/lib/stores/preferences.svelte.ts src/lib/native/store-api.ts src/lib/components/UnsavedDialog.svelte src/lib/controllers/window-lifecycle.ts src/App.svelte tests/preferences.test.ts tests/session.test.ts tests/unsaved-dialog.test.ts
git commit -m "feat: add settings sessions and close protection"
```

---

### Task 9: Handle External File Changes and Read-Only Comparison

**Files:**
- Create: `src-tauri/src/watch.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Create: `src/lib/controllers/external-changes.ts`
- Create: `src/lib/components/ExternalChangeDialog.svelte`
- Create: `src/lib/components/DiffView.svelte`
- Create: `tests/external-changes.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: canonical file paths, document dirty state, `read_text_file`, settings, and Tauri events.
- Produces: commands `watch_path(path)` and `unwatch_path(path)`, event `file-changed`, `ExternalChangeDeps`, and decision functions `reload`, `compare`, and `keepEditorVersion`.

- [ ] **Step 1: Write failing decision tests**

```ts
// tests/external-changes.test.ts
function fakeExternalDeps(options: { dirty: boolean; autoReloadCleanFiles: boolean; diskText: string }): ExternalChangeDeps {
  return {
    findDocumentByPath: () => ({ id: 'a', path: '/tmp/a.txt', dirty: options.dirty, modifiedMs: 1 }),
    autoReloadCleanFiles: () => options.autoReloadCleanFiles,
    readFile: async () => ({
      path: '/tmp/a.txt', text: options.diskText, encoding: 'utf-8', bom: false,
      lineEnding: 'lf', modifiedMs: 2, size: options.diskText.length, large: false
    }),
    replaceFromDisk: vi.fn(),
    prompt: vi.fn(),
    notify: vi.fn()
  };
}

it('auto-reloads a clean file when enabled', async () => {
  const deps = fakeExternalDeps({ dirty: false, autoReloadCleanFiles: true, diskText: 'new\n' });
  await createExternalChangeController(deps).onChanged('/tmp/a.txt');
  expect(deps.replaceFromDisk).toHaveBeenCalledWith(expect.objectContaining({ text: 'new\n' }));
  expect(deps.prompt).not.toHaveBeenCalled();
});

it('prompts instead of overwriting a dirty editor', async () => {
  const deps = fakeExternalDeps({ dirty: true, autoReloadCleanFiles: true, diskText: 'disk\n' });
  await createExternalChangeController(deps).onChanged('/tmp/a.txt');
  expect(deps.prompt).toHaveBeenCalledWith(expect.objectContaining({ path: '/tmp/a.txt' }));
  expect(deps.replaceFromDisk).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED in TypeScript and Rust**

Run: `npm test -- tests/external-changes.test.ts && cargo test --manifest-path src-tauri/Cargo.toml watch`  
Expected: both commands fail because controller and watcher module are absent.

- [ ] **Step 3: Implement a debounced watcher with explicit lifecycle**

Use `notify = "8"` and `notify-debouncer-mini = "0.7"`. Store one watcher per canonical path in Tauri managed state, debounce for 250 ms, emit `{ path }` only for content/rename/remove events, and remove watchers when the final tab for a path closes. Never interpret emitted paths as instructions.

- [ ] **Step 4: Implement reload/compare/keep behavior**

```ts
export type ExternalChangeDeps = Readonly<{
  findDocumentByPath: (path: string) => Readonly<{ id: string; path: string; dirty: boolean; modifiedMs: number | null }> | undefined;
  autoReloadCleanFiles: () => boolean;
  readFile: (path: string, allowLarge: boolean) => Promise<OpenFilePayload>;
  replaceFromDisk: (documentId: string, file: OpenFilePayload) => void;
  prompt: (change: Readonly<{ documentId: string; path: string; disk: OpenFilePayload }>) => void;
  notify: (message: string) => void;
}>;
```

Dirty files always open `ExternalChangeDialog`. Compare renders `@codemirror/merge` with the disk text and editor text in read-only mode; closing the diff changes neither version. `Keep Editor Version` records the observed disk metadata separately from the expected save metadata, so the next save detects the conflict and requires explicit overwrite confirmation.

Run: `npm test -- tests/external-changes.test.ts && cargo test --manifest-path src-tauri/Cargo.toml && npm run check`  
Expected: clean reload, dirty prompt, watcher cleanup, and comparison isolation tests pass.

- [ ] **Step 5: Commit external-change safety**

```bash
git add src-tauri/src/watch.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src/lib/controllers/external-changes.ts src/lib/components/ExternalChangeDialog.svelte src/lib/components/DiffView.svelte src/App.svelte tests/external-changes.test.ts
git commit -m "feat: protect against external file changes"
```

---

### Task 10: Add Sanitized Local Markdown Preview

**Files:**
- Create: `src/lib/markdown/render-markdown.ts`
- Create: `src/lib/components/MarkdownPreview.svelte`
- Create: `tests/markdown-preview.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: active Markdown document text.
- Produces: `renderMarkdown(source): string` and a split-view preview that never executes scripts or fetches remote content.

- [ ] **Step 1: Write a failing security-focused rendering test**

```ts
// tests/markdown-preview.test.ts
import { renderMarkdown } from '../src/lib/markdown/render-markdown';

it('renders Markdown while removing scripts, handlers, and remote images', () => {
  const html = renderMarkdown('# Safe\n<script>alert(1)</script>\n<img src="https://example.com/x.png" onerror="alert(2)">');
  expect(html).toContain('<h1>Safe</h1>');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('onerror');
  expect(html).not.toContain('https://example.com');
});
```

- [ ] **Step 2: Verify the security test fails**

Run: `npm test -- tests/markdown-preview.test.ts`  
Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: Implement strict Markdown sanitization**

```ts
// src/lib/markdown/render-markdown.ts
import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ async: false, gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  const rendered = marked.parse(source) as string;
  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'img'],
    FORBID_ATTR: ['style']
  });
}
```

Render with Svelte's HTML insertion only from `renderMarkdown`; give the preview a sandboxed styling root, disable it for non-Markdown tabs, and catch rendering errors so the editor remains usable.

- [ ] **Step 4: Verify preview isolation**

Run: `npm test -- tests/markdown-preview.test.ts && npm test && npm run check`  
Expected: malicious markup is removed and the complete suite passes.

- [ ] **Step 5: Commit Markdown preview**

```bash
git add src/lib/markdown/render-markdown.ts src/lib/components/MarkdownPreview.svelte src/App.svelte tests/markdown-preview.test.ts
git commit -m "feat: add safe local Markdown preview"
```

---

### Task 11: Add Menus, Status Controls, Shortcuts, and Accessibility

**Files:**
- Create: `src/lib/components/StatusBar.svelte`
- Create: `src/lib/controllers/commands.ts`
- Create: `src/lib/accessibility/focus.ts`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.svelte`
- Modify: `src/app.css`
- Create: `tests/commands.test.ts`
- Create: `tests/status-bar.test.ts`
- Create: `tests/accessibility.test.ts`

**Interfaces:**
- Consumes: document actions, active editor handle, preferences, and Tauri menu events.
- Produces: stable command IDs `file.new`, `file.open`, `file.save`, `file.saveAs`, `file.close`, `edit.find`, `edit.replace`, `view.wrap`, `view.markdownPreview`, `view.zoomIn`, `view.zoomOut`, `view.theme`; semantic status controls.

- [ ] **Step 1: Write failing command and accessibility tests**

```ts
// tests/commands.test.ts
it('routes Ctrl+Shift+S to Save As without exposing a command palette', async () => {
  const saveAs = vi.fn();
  const deps: CommandDeps = {
    activeId: () => 'active-id',
    newDocument: vi.fn(), openDialog: vi.fn(), save: vi.fn(), saveAs,
    closeActive: vi.fn(), openFind: vi.fn(), openReplace: vi.fn(),
    toggleWrap: vi.fn(), toggleMarkdownPreview: vi.fn(),
    zoomIn: vi.fn(), zoomOut: vi.fn(), cycleTheme: vi.fn()
  };
  const controller = createCommandController(deps);
  await controller.execute('file.saveAs');
  expect(saveAs).toHaveBeenCalledWith('active-id');
  expect(controller.ids).not.toContain('view.commandPalette');
});

// tests/accessibility.test.ts
it('keeps every primary action reachable by an accessible name', () => {
  render(App);
  expect(screen.getByRole('application', { name: 'PrismPad' })).toBeInTheDocument();
  expect(screen.getByRole('tablist', { name: 'Open documents' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/commands.test.ts tests/status-bar.test.ts tests/accessibility.test.ts`  
Expected: FAIL because command routing and the status bar are absent.

- [ ] **Step 3: Implement menus and focused status controls**

```ts
export type CommandDeps = Readonly<{
  activeId: () => string | null;
  newDocument: () => void; openDialog: () => Promise<void>;
  save: (id: string) => Promise<void>; saveAs: (id: string) => Promise<void>;
  closeActive: () => Promise<void>; openFind: () => void; openReplace: () => void;
  toggleWrap: () => void; toggleMarkdownPreview: () => void;
  zoomIn: () => void; zoomOut: () => void; cycleTheme: () => void;
}>;
```

Create native File, Edit, View, and Help menus in Rust and emit only the stable command IDs. Route menu events and keyboard shortcuts through one TypeScript controller. `StatusBar.svelte` shows language, `Ln N, Col N`, `UTF-8`, `LF`/`CRLF`, and `Spaces: N`/`Tabs: N`; clickable settings open a narrow popover for only that value.

- [ ] **Step 4: Meet keyboard, focus, contrast, and reduced-motion requirements**

Add roving tab focus, `Escape` behavior for dialogs/popovers, focus return to the invoking control, visible `:focus-visible` outlines, non-color dirty text for screen readers, `prefers-reduced-motion`, and a theme-token contrast test using computed luminance ratios of at least 4.5:1 for normal text. Wrap the workspace in a Svelte boundary whose failure view keeps the window open, reports `PrismPad encountered an interface error. Your open documents remain in memory.`, and exposes a `Retry interface` button.

Run: `npm test -- tests/commands.test.ts tests/status-bar.test.ts tests/accessibility.test.ts && npm run check && npm test`  
Expected: all commands, status states, keyboard paths, and contrast assertions pass.

- [ ] **Step 5: Commit interaction polish**

```bash
git add src/lib/components/StatusBar.svelte src/lib/controllers/commands.ts src/lib/accessibility/focus.ts src-tauri/src/lib.rs src/App.svelte src/app.css tests/commands.test.ts tests/status-bar.test.ts tests/accessibility.test.ts
git commit -m "feat: add menus status and accessible controls"
```

---

### Task 12: Package, Exercise, Document, and Gate Releases

**Files:**
- Modify: `package.json`
- Create: `wdio.conf.ts`
- Create: `e2e/startup.e2e.ts`
- Create: `e2e/file-workflow.e2e.ts`
- Create: `scripts/assert-no-network.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: complete PrismPad application and all stable accessibility labels/command IDs.
- Produces: `npm run test:e2e`, Windows NSIS installer, Linux DEB/AppImage, CI artifacts, and contributor/user documentation.

- [ ] **Step 1: Add failing packaged-application smoke scenarios**

```ts
// e2e/startup.e2e.ts
describe('PrismPad startup', () => {
  it('shows the welcome chooser without IDE panels', async () => {
    await expect($('h1=Hello! What will you code in today?')).toBeDisplayed();
    await expect($('[role="tablist"]')).toExist();
    await expect($('*=Terminal')).not.toExist();
  });
});
```

```ts
// e2e/file-workflow.e2e.ts
describe('PrismPad file workflow', () => {
  it('creates Python, edits it, and reports the Python language', async () => {
    await $('button=Python').click();
    await expect($('[data-testid="status-language"]')).toHaveText('Python');
    await $('[data-testid="editor-host"]').click();
    await browser.keys(['p', 'r', 'i', 'n', 't', '(', '1', ')']);
    await expect($('[role="tab"][aria-selected="true"]')).toHaveElementClass('is-dirty');
  });
});
```

- [ ] **Step 2: Add exact E2E dependencies and verify the scenario fails before driver configuration**

Add exact dev dependencies `webdriverio@9.30.0`, `@wdio/cli@9.30.0`, `@wdio/local-runner@9.30.0`, `@wdio/mocha-framework@9.30.0`, and `@wdio/spec-reporter@9.29.1`. Add `test:e2e: wdio run ./wdio.conf.ts`.

Run: `npm run test:e2e`  
Expected: FAIL because `wdio.conf.ts` and the built application driver are not configured.

- [ ] **Step 3: Configure platform E2E and CI**

Configure WebdriverIO to connect to `tauri-driver`, one instance, Mocha, and the platform-built debug binary. GitHub Actions uses a Windows matrix entry and `ubuntu-24.04`, Node 22, stable Rust, npm cache, required WebKitGTK/system packages, `npm ci`, `npm run check`, `npm test`, `cargo test`, debug Tauri build, E2E, release build, and artifact upload. No publishing or signing occurs in v1 CI until signing identities are configured explicitly.

- [ ] **Step 4: Add release documentation and offline assertion**

`README.md` documents the product boundary, exact supported operating systems, supported languages, keyboard shortcuts, build prerequisites, `npm ci`, `npm run tauri dev`, test commands, artifact locations, local-only privacy guarantee, and the absence of autocomplete. `scripts/assert-no-network.mjs` scans production JavaScript for `fetch(`, `XMLHttpRequest`, `WebSocket`, and hard-coded `http://`/`https://` strings, allowing only Tauri's configured local dev URL in non-production config.

Run: `npm run check && npm test && cargo test --manifest-path src-tauri/Cargo.toml && npm run build && node scripts/assert-no-network.mjs dist && npm run tauri build`  
Expected: every command exits 0; output contains NSIS on Windows or DEB and AppImage on Ubuntu; offline assertion prints `No unexpected network APIs found.`

- [ ] **Step 5: Run the complete release gate and record measured baselines**

Launch the packaged build five times on each CI target and record median time-to-welcome, idle resident memory after 30 seconds, and artifact sizes in the GitHub Actions job summary. Treat regressions greater than 20% from the committed first baseline as warnings until explicit hard budgets are approved.

Run: `npm run check && npm test && cargo test --manifest-path src-tauri/Cargo.toml && npm run test:e2e`  
Expected: TypeScript/Svelte checks, Vitest, Rust tests, and packaged-app E2E all pass on Windows and Ubuntu.

- [ ] **Step 6: Commit release engineering and documentation**

```bash
git add package.json package-lock.json wdio.conf.ts e2e scripts .github/workflows/ci.yml README.md src-tauri/tauri.conf.json
git commit -m "chore: add PrismPad release gates and packaging"
```

---

## Final Verification Checklist

- [ ] Run `npm ci` from a clean checkout; expected exit code 0.
- [ ] Run `npm run check`; expected zero Svelte or TypeScript errors.
- [ ] Run `npm test`; expected every Vitest suite passes.
- [ ] Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`; expected no diff.
- [ ] Run `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`; expected zero warnings.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml`; expected every Rust test passes.
- [ ] Run `npm run build`; expected Vite production build succeeds.
- [ ] Run `node scripts/assert-no-network.mjs dist`; expected `No unexpected network APIs found.`
- [ ] Run `npm run tauri build`; expected the platform's installer artifacts are created.
- [ ] Run `npm run test:e2e`; expected startup, edit, Save As, extension-change, restore, external-change, line-ending, close-protection, settings, and package-launch scenarios pass.
- [ ] Inspect the welcome screen in system light and dark themes; expected exact greeting, connected rectangular tabs, no sidebar, and no rounded pill navigation.
- [ ] Search `src` for `autocompletion`, `language server`, `terminal`, `debugger`, and network APIs; expected no runtime implementations.
- [ ] Confirm session storage contains paths and view positions only; expected no user document text.

## Specification Traceability

| Specification area | Implemented and verified by |
|---|---|
| Product boundary and supported systems | Tasks 1 and 12 |
| Light/dark visual system and connected rectangular tabs | Task 4, verified again in Task 12 |
| Exact welcome greeting and supported-language chooser | Task 2 and Task 4 |
| Extension detection and suggested first-save suffix | Tasks 2 and 7 |
| Multi-tab document lifecycle and unsaved indicators | Tasks 3, 4, and 8 |
| UTF-8/BOM, `LF`/`CRLF`, binary, large-file, and atomic-save behavior | Task 6 and Task 7 |
| Editing fundamentals with no autocomplete | Task 5 and final source audit |
| Preferences and safe session metadata | Task 8 |
| External-change reload, compare, and keep decisions | Task 9 |
| Sanitized, local-only Markdown preview | Task 10 |
| Menus, shortcuts, status bar, errors, and accessibility | Task 11 |
| Windows/Linux E2E, packaging, offline check, and performance baselines | Task 12 |
