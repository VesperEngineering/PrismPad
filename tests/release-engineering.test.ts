import { readFileSync } from 'node:fs';

const normalizeNewlines = (source: string): string => source.replace(/\r\n?/g, '\n');
const readNormalized = (path: string): string => normalizeNewlines(readFileSync(path, 'utf8'));
const wdio = readNormalized('wdio.conf.ts');
const workflow = readNormalized('.github/workflows/ci.yml');
const readme = readNormalized('README.md');
const workflowWithWindowsNewlines = workflow.replace(/\n/g, '\r\n');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const startup = readNormalized('e2e/startup.e2e.ts');
const documentWorkflow = readNormalized('e2e/file-workflow.e2e.ts');
const nativeFiles = readNormalized('src-tauri/src/files.rs');
const nativeFilesWithWindowsNewlines = nativeFiles.replace(/\n/g, '\r\n');
const nativeWatch = readNormalized('src-tauri/src/watch.rs');
const documentActions = readNormalized('tests/document-actions.test.ts');
const externalChanges = readNormalized('tests/external-changes.test.ts');

describe('release engineering configuration', () => {
  it('keeps multiline workflow assertions portable across Windows checkouts', () => {
    expect(normalizeNewlines(workflowWithWindowsNewlines)).toContain('- name: Check frontend\n        run: npm run check');
    expect(normalizeNewlines(nativeFilesWithWindowsNewlines)).toMatch(/#\[cfg\(test\)\]\npub fn atomic_write\(/);
  });

  it('passes the release application through the required Tauri capability and typechecks E2E', () => {
    expect(wdio).toContain("'tauri:options'");
    expect(wdio).toMatch(/application:\s*applicationPath/);
    expect(wdio).toContain('PRISMPAD_E2E_APP');
    expect(wdio).toContain('PRISMPAD_E2E_DEBUGGER_ADDRESS');
    expect(wdio).toContain("'ms:edgeOptions': { debuggerAddress }");
    expect(packageJson.scripts['check:e2e']).toBe('tsc --noEmit --project tsconfig.e2e.json');
    expect(packageJson.devDependencies).toMatchObject({
      '@types/node': '20.19.43',
      '@wdio/globals': '9.29.1',
      '@wdio/types': '9.29.1'
    });
    expect(wdio).toContain('connectionRetryTimeout: 120_000');
  });

  it('starts tauri-driver without an executable argument and installs native drivers', () => {
    expect(workflow).not.toMatch(/tauri-driver[^\n]*\$\{\{ matrix\.executable \}\}/);
    expect(workflow).toContain('webkit2gtk-driver');
    expect(workflow).toContain('msedgedriver-tool');
    expect(workflow).toContain('cargo clippy --locked');
    expect(workflow).toContain('npm run check:e2e');
    expect(workflow).toContain('cargo install tauri-driver --version 2.0.6 --locked');
    expect(workflow).toContain('--rev 8c4b34f51b45f5cf08013366d703de464ab871d1');
  });

  it('prints native driver diagnostics when a packaged E2E session fails', () => {
    expect(workflow).toContain("cat artifacts/tauri-driver.log >&2");
    expect(workflow).toContain("Get-Content artifacts/tauri-driver.log -ErrorAction SilentlyContinue");
    expect(workflow).toContain("Get-Content artifacts/tauri-driver.err.log -ErrorAction SilentlyContinue");
  });

  it('attaches Windows EdgeDriver only after the packaged WebView2 endpoint is ready', () => {
    expect(workflow).toContain("PRISMPAD_E2E_DEBUGGER_ADDRESS: '127.0.0.1:9222'");
    expect(workflow).toContain("Start-Process msedgedriver");
    expect(workflow).toContain("New-ItemProperty $webviewPolicy -Name 'prism-pad.exe' -Value '--remote-debugging-port=9222'");
    expect(workflow).toContain("Remove-ItemProperty $webviewPolicy -Name 'prism-pad.exe'");
    expect(workflow).toContain('$hadExistingPolicy');
    expect(workflow).toContain('$previousPolicyValue');
    expect(workflow).toContain("Remove-ItemProperty $webviewPolicy -Name 'prism-pad.exe' -ErrorAction Stop");
    expect(workflow).toContain("Wait-ForEndpoint 'http://127.0.0.1:9222/json/version'");
    expect(workflow).toContain("Wait-ForEndpointToClose 'http://127.0.0.1:9222/json/version'");
    expect(workflow).toContain("'packaged WebView2 debugging endpoint did not become ready'");
    expect(readme).toContain("New-ItemProperty $webviewPolicy -Name 'prism-pad.exe' -Value '--remote-debugging-port=9222'");
    expect(readme).toContain("$env:PRISMPAD_E2E_DEBUGGER_ADDRESS='127.0.0.1:9222'");
    expect(readme).toContain('msedgedriver --port=4444 --host=127.0.0.1');
    expect(readme).toContain('$ready = $false');
    expect(readme).toContain('for ($attempt = 0; $attempt -lt 30 -and !$ready; $attempt++)');
    expect(readme).toContain('$hadExistingPolicy');
    expect(readme).toContain("Remove-ItemProperty $webviewPolicy -Name 'prism-pad.exe' -ErrorAction Stop");
    expect(readme).toMatch(/try \{[\s\S]*npm run test:e2e[\s\S]*finally \{\s+if \(\$app\) \{ Stop-Process/);
  });

  it('uses independent Windows-sensitive commands and audits native capabilities', () => {
    expect(workflow).toContain('- name: Check frontend\n        run: npm run check');
    expect(workflow).toContain('- name: Check packaged E2E types\n        run: npm run check:e2e');
    expect(workflow).toContain('- name: Build production frontend\n        run: npm run build');
    expect(workflow).toContain('- name: Audit offline boundary\n        run: npm run audit:offline');
    expect(workflow).not.toMatch(/run: \|\s+npm run check\s+npm run check:e2e/);
    expect(packageJson.scripts['audit:offline']).toContain('src-tauri/capabilities');
  });

  it('cleans up dirty documents by choosing Discard and confirming Continue', () => {
    expect(documentWorkflow).toContain("selectByAttribute('value', 'discard')");
    expect(documentWorkflow).toContain("$('button=Continue').click()");
  });

  it('asserts every supported startup language and reliable packaged workflows', () => {
    for (const language of [
      'Plain Text', 'Python', 'Markdown', 'YAML', 'JSON', 'JavaScript', 'TypeScript', 'JSX', 'TSX',
      'HTML', 'CSS', 'Shell', 'PowerShell', 'Rust', 'C', 'C++', 'Java', 'SQL', 'TOML', 'XML'
    ]) expect(startup).toContain(`'${language}'`);

    for (const behavior of ['settings persistence', 'tab drag reorder', 'unsaved work', 'Markdown preview']) {
      expect(documentWorkflow).toContain(behavior);
    }
    expect(documentWorkflow).toContain('tabs[2].dragAndDrop(tabs[0])');
    expect(documentWorkflow).toContain('toEqual([thirdTitle, firstTitle, secondTitle])');
    expect(documentWorkflow).toMatch(
      /browser\.refresh\(\);[\s\S]*Hello! What will you code in today\?[\s\S]*button=Plain Text[\s\S]*status-indentation/
    );
  });

  it('tests a release-profile executable and uploads concrete platform bundles', () => {
    expect(workflow).toContain('src-tauri/target/release/prism-pad');
    expect(workflow).toContain('src-tauri/target/release/prism-pad.exe');
    expect(workflow).toContain('src-tauri/target/release/bundle/nsis/*.exe');
    expect(workflow).toContain('src-tauri/target/release/bundle/deb/*.deb');
    expect(workflow).toContain('src-tauri/target/release/bundle/appimage/*.AppImage');
    expect(workflow).toContain('$installers | ForEach-Object { $_.Length }');
    expect(workflow).toContain('if-no-files-found: warn');
    expect(workflow).toContain('npm run tauri build -- --bundles ${{ matrix.bundle }}');
  });

  it('maps native-dialog gaps to executable native behavior tests without a DOM fake', () => {
    expect(nativeFiles).toContain('fn round_trip_preserves_bom_and_crlf()');
    expect(nativeFiles).toContain('fn write_rejects_changed_same_size_content_when_metadata_matches()');
    expect(documentActions).toContain('suggests the selected language suffix and updates path and syntax only after Save As succeeds');
    expect(externalChanges).toContain('prompts instead of overwriting a dirty editor');
    expect(documentWorkflow).not.toContain('mockNativeDialog');
  });

  it('keeps test-only Rust helpers scoped and production watcher code Clippy-clean', () => {
    expect(nativeFiles).toMatch(/#\[cfg\(test\)\]\npub fn atomic_write\(/);
    expect(nativeFiles).toMatch(/#\[cfg\(test\)\]\nfn file_metadata\(/);
    expect(nativeWatch).toMatch(/#\[cfg\(test\)\]\npub\(crate\) fn debounce_delay\(/);
    expect(nativeFiles.match(/struct FileSnapshot \{([\s\S]*?)\n\}/)?.[1]).not.toContain('permissions');
    expect(nativeFiles.match(/struct FileBaseline \{([\s\S]*?)\n\}/)?.[1]).toContain('permissions');
    expect(nativeWatch).toContain('.filter(|(_, entry)| entry.deadline <= now)');
    expect(nativeWatch).not.toContain('(entry.deadline <= now).then');
    expect(nativeFiles).toContain('type ParentDirectorySync = File;');
    expect(nativeFiles).toContain('struct ParentDirectorySync;');
    expect(nativeFiles).toContain('Result<ParentDirectorySync, FileError>');
    expect(nativeFiles).not.toContain('prepare_parent_directory_sync(_path: &Path) -> Result<(), FileError>');
  });
});
