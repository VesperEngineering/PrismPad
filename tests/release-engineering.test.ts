import { readFileSync } from 'node:fs';

const wdio = readFileSync('wdio.conf.ts', 'utf8');
const normalizeNewlines = (source: string): string => source.replace(/\r\n?/g, '\n');
const workflow = normalizeNewlines(readFileSync('.github/workflows/ci.yml', 'utf8'));
const workflowWithWindowsNewlines = workflow.replace(/\n/g, '\r\n');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const startup = readFileSync('e2e/startup.e2e.ts', 'utf8');
const documentWorkflow = readFileSync('e2e/file-workflow.e2e.ts', 'utf8');
const nativeFiles = readFileSync('src-tauri/src/files.rs', 'utf8');
const documentActions = readFileSync('tests/document-actions.test.ts', 'utf8');
const externalChanges = readFileSync('tests/external-changes.test.ts', 'utf8');

describe('release engineering configuration', () => {
  it('keeps multiline workflow assertions portable across Windows checkouts', () => {
    expect(normalizeNewlines(workflowWithWindowsNewlines)).toContain('- name: Check frontend\n        run: npm run check');
  });

  it('passes the release application through the required Tauri capability and typechecks E2E', () => {
    expect(wdio).toContain("'tauri:options'");
    expect(wdio).toMatch(/application:\s*applicationPath/);
    expect(wdio).toContain('PRISMPAD_E2E_APP');
    expect(packageJson.scripts['check:e2e']).toBe('tsc --noEmit --project tsconfig.e2e.json');
    expect(packageJson.devDependencies).toMatchObject({
      '@types/node': '20.19.43',
      '@wdio/globals': '9.29.1',
      '@wdio/types': '9.29.1'
    });
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
  });

  it('maps native-dialog gaps to executable native behavior tests without a DOM fake', () => {
    expect(nativeFiles).toContain('fn round_trip_preserves_bom_and_crlf()');
    expect(nativeFiles).toContain('fn write_rejects_changed_same_size_content_when_metadata_matches()');
    expect(documentActions).toContain('suggests the selected language suffix and updates path and syntax only after Save As succeeds');
    expect(externalChanges).toContain('prompts instead of overwriting a dirty editor');
    expect(documentWorkflow).not.toContain('mockNativeDialog');
  });
});
