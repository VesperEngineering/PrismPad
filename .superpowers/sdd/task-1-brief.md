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
