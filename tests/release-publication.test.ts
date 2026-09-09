import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const readme = read('README.md');
const iconPath = 'docs/assets/prismpad-icon.png';
const workflowPath = '.github/workflows/release.yml';
const notesPath = 'RELEASE_NOTES.md';
const releaseAssets = [
  'PrismPad-v0.1.1-windows-x64-portable.exe',
  'PrismPad-v0.1.1-windows-x64-setup.exe',
  'PrismPad-v0.1.1-linux-x64.AppImage',
  'PrismPad-v0.1.1-ubuntu-24.04-x64.deb'
];

describe('public release presentation', () => {
  it('centers the approved PrismPad artwork at a restrained size', () => {
    expect(existsSync(iconPath)).toBe(true);
    expect(statSync(iconPath).size).toBeGreaterThan(0);
    expect(readme).toContain('<p align="center">\n  <img src="docs/assets/prismpad-icon.png" alt="PrismPad icon" width="220">\n</p>');
  });

  it('shows live build and release state with supported platforms', () => {
    expect(readme).toContain('actions/workflows/ci.yml/badge.svg?branch=main');
    expect(readme).toContain('releases/latest');
    expect(readme).toContain('img.shields.io/github/v/release/VesperEngineering/PrismPad?display_name=tag&sort=semver');
    expect(readme).toContain('Windows-10%20%7C%2011');
    expect(readme).toContain('Ubuntu-24.04%2B');
    expect(readme).not.toMatch(/badge\/(?:build|status)-stable/i);
    expect(readme).not.toMatch(/badge\/(?:signed|security|license)-/i);
  });
});

describe('v0.1.1 release publication', () => {
  it('documents the stable release scope and unsigned installer warning', () => {
    const notes = read(notesPath);
    expect(notes).toContain('# PrismPad v0.1.1');
    expect(notes).toContain('Windows 10/11');
    expect(notes).toContain('Ubuntu 24.04');
    expect(notes).toContain('boxed tabs');
    expect(notes).toContain('Hello! What will you code in today?');
    expect(notes).toContain('local-only');
    expect(notes).toContain('unsigned');
    expect(notes).toContain('SmartScreen');
    for (const asset of releaseAssets) expect(notes).toContain(asset);
  });

  it('validates pull requests but publishes only from a main-branch push', () => {
    const workflow = read(workflowPath);
    expect(workflow).toContain('VERSION: 0.1.1');
    expect(workflow).toContain('TAG: v0.1.1');
    expect(workflow).toContain('node scripts/assert-release-version.mjs "$VERSION"');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('on:\n  pull_request:');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('workflow_dispatch:');

    const publishIndex = workflow.indexOf('  publish-release:');
    expect(publishIndex).toBeGreaterThan(0);
    expect(workflow.slice(0, publishIndex)).not.toContain('contents: write');
    expect(workflow.slice(publishIndex)).toContain('permissions:\n      contents: write');
    expect(workflow.slice(publishIndex)).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    expect(workflow).not.toContain("\n    if: github.ref == 'refs/heads/main'\n");
  });

  it('pins every external action to an approved Node-24-native revision', () => {
    const workflow = read(workflowPath);
    const uses = workflow.match(/^\s+- uses: .+$/gm)?.map((line) => line.trim()) ?? [];
    expect(uses).toEqual([
      '- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2',
      '- uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0',
      '- uses: dtolnay/rust-toolchain@4cda84d5c5c54efe2404f9d843567869ab1699d4 # stable 2026-07-16',
      '- uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
      '- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2',
      '- uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1'
    ]);

    const setupNode = workflow.slice(
      workflow.indexOf('- uses: actions/setup-node@'),
      workflow.indexOf('- uses: dtolnay/rust-toolchain@')
    );
    expect(setupNode).toContain('node-version: 22');
    expect(setupNode).toContain('cache: npm');
    expect(setupNode).toContain('package-manager-cache: false');
  });

  it('runs the complete validation gate on Windows and Ubuntu', () => {
    const workflow = read(workflowPath);
    for (const required of [
      'os: ubuntu-24.04',
      'os: windows-latest',
      'bundle: deb,appimage',
      'bundle: nsis',
      'npm ci',
      'npm run check',
      'npm run check:e2e',
      'npm test',
      'cargo fmt --manifest-path src-tauri/Cargo.toml -- --check',
      'cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings',
      'cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features',
      'npm run build',
      'npm run audit:offline',
      'npm run tauri build -- --bundles ${{ matrix.bundle }}',
      'xvfb',
      'dpkg-deb --info'
    ]) expect(workflow).toContain(required);
    expect(workflow).toContain("if-no-files-found: error");
  });

  it('preseeds every AppImage helper behind a literal SHA-256 manifest', () => {
    const workflow = read(workflowPath);
    const helperStart = workflow.indexOf('      - name: Preseed verified Tauri AppImage helpers');
    const bundleStart = workflow.indexOf('      - name: Build platform bundles');
    expect(helperStart).toBeGreaterThan(0);
    expect(bundleStart).toBeGreaterThan(helperStart);

    const helper = workflow.slice(helperStart, bundleStart);
    expect(helper).toContain('tauri_cache="$HOME/.cache/tauri"');
    expect(helper).toContain("curl_args=(--proto '=https' --tlsv1.2 --fail --location --retry 3)");
    expect(helper).toContain(
      'cat > "$tauri_cache/appimage-helper-sha256sums.txt" <<\'SHA256SUMS\''
    );
    expect(helper).toContain(
      '(cd "$tauri_cache" && sha256sum --check appimage-helper-sha256sums.txt)'
    );

    const helpers = [
      {
        filename: 'AppRun-x86_64',
        source: 'https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-x86_64',
        sha256: 'f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f'
      },
      {
        filename: 'linuxdeploy-x86_64.AppImage',
        source:
          'https://github.com/tauri-apps/binary-releases/releases/download/linuxdeploy/linuxdeploy-x86_64.AppImage',
        sha256: 'e762bea85c8eb0d4b3508d46e5c1f037f717d0f9303ae3b4aafc8b04991fa1ef'
      },
      {
        filename: 'linuxdeploy-plugin-gtk.sh',
        source:
          'https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gtk/b5eb8d05b4c0ed40107fe2158c5d8527f94568ef/linuxdeploy-plugin-gtk.sh',
        sha256: 'cb379f9b0733e9ad9f8bd78f8c2fa038aef2478523bb7d4c8e64ff6a1ea3501a'
      },
      {
        filename: 'linuxdeploy-plugin-gstreamer.sh',
        source:
          'https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gstreamer/2a2e67491c32995a3f279ad0ecbe77abd512b42a/linuxdeploy-plugin-gstreamer.sh',
        sha256: 'c107b49d84edbffc6ab226ed1007e0626a4f7aa2c3a36b7782bef62351d49e94'
      },
      {
        filename: 'linuxdeploy-plugin-appimage.AppImage',
        source:
          'https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage',
        sha256: '1da16a46fa5e058ae740e7c35ed0d36d86cb869ac9cc8a5fd9a1847d7978d99a'
      }
    ];

    const manifestIndex = helper.indexOf(
      'cat > "$tauri_cache/appimage-helper-sha256sums.txt"'
    );
    const verifyIndex = helper.indexOf(
      '(cd "$tauri_cache" && sha256sum --check appimage-helper-sha256sums.txt)'
    );
    const chmodIndex = helper.indexOf('chmod 0755');
    expect(helper.lastIndexOf('--output "$tauri_cache/')).toBeLessThan(manifestIndex);
    expect(manifestIndex).toBeLessThan(verifyIndex);
    expect(verifyIndex).toBeLessThan(chmodIndex);

    for (const { filename, source, sha256 } of helpers) {
      const downloadIndex = helper.indexOf(`--output "$tauri_cache/${filename}"`);
      const sourceIndex = helper.indexOf(source, downloadIndex);
      const hashIndex = helper.indexOf(`${sha256}  ${filename}`, manifestIndex);
      const executableIndex = helper.indexOf(`"$tauri_cache/${filename}"`, chmodIndex);
      expect(downloadIndex).toBeGreaterThan(0);
      expect(sourceIndex).toBeGreaterThan(downloadIndex);
      expect(sourceIndex).toBeLessThan(manifestIndex);
      expect(hashIndex).toBeGreaterThan(manifestIndex);
      expect(hashIndex).toBeLessThan(verifyIndex);
      expect(executableIndex).toBeGreaterThan(chmodIndex);
    }
  });

  it('smoke-launches both final portable assets before staging them', () => {
    const workflow = read(workflowPath);
    const bundleIndex = workflow.indexOf('      - name: Build platform bundles');
    const linuxSmokeIndex = workflow.indexOf(
      '      - name: Smoke-launch Linux portable AppImage'
    );
    const windowsSmokeIndex = workflow.indexOf(
      '      - name: Smoke-launch Windows portable executable'
    );
    const linuxStageIndex = workflow.indexOf('      - name: Validate Ubuntu packages');
    const windowsStageIndex = workflow.indexOf(
      '      - name: Validate and stage Windows packages'
    );

    expect(linuxSmokeIndex).toBeGreaterThan(bundleIndex);
    expect(windowsSmokeIndex).toBeGreaterThan(bundleIndex);
    expect(linuxStageIndex).toBeGreaterThan(linuxSmokeIndex);
    expect(windowsStageIndex).toBeGreaterThan(windowsSmokeIndex);

    const linuxSmoke = workflow.slice(linuxSmokeIndex, windowsSmokeIndex);
    expect(linuxSmoke).toContain('APPIMAGE_EXTRACT_AND_RUN=1');
    expect(linuxSmoke).toContain(
      'timeout --signal=TERM --kill-after=5s 10s xvfb-run -a'
    );
    expect(linuxSmoke).toContain('smoke_status=$?');
    expect(linuxSmoke).toContain('cat "$smoke_log"');
    expect(linuxSmoke).toContain('if test "$smoke_status" -ne 124; then');

    const windowsSmoke = workflow.slice(windowsSmokeIndex, linuxStageIndex);
    expect(windowsSmoke).toContain(
      "Get-Item 'src-tauri/target/release/prism-pad.exe'"
    );
    expect(windowsSmoke).toContain('Start-Process $portable.FullName -PassThru');
    expect(windowsSmoke).toContain('Start-Sleep -Seconds 10');
    expect(windowsSmoke).toContain('if ($process.HasExited)');
    expect(windowsSmoke).toContain('Get-Content $stdoutPath -ErrorAction SilentlyContinue');
    expect(windowsSmoke).toContain('Get-Content $stderrPath -ErrorAction SilentlyContinue');
    expect(windowsSmoke).toContain(
      'Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue'
    );
  });

  it('stages two validated files per platform before artifact upload', () => {
    const workflow = read(workflowPath);
    expect(workflow).toContain("Get-Item 'src-tauri/target/release/prism-pad.exe'");
    expect(workflow).toContain('test ${#staged[@]} -eq 2');
    expect(workflow).toContain('if ($staged.Count -ne 2)');
    for (const asset of releaseAssets) expect(workflow).toContain(`release-staging/${asset}`);

    const uploadStart = workflow.indexOf('- uses: actions/upload-artifact@');
    const uploadEnd = workflow.indexOf('  publish-release:');
    const upload = workflow.slice(uploadStart, uploadEnd);
    expect(upload).toContain('path: release-staging/');
    expect(upload).not.toContain('src-tauri/target/release/bundle/');
    expect(upload).not.toContain('src-tauri/target/release/prism-pad.exe');
    expect(upload).not.toContain('artifacts/');
  });

  it('downloads and publishes only the four exact staged assets', () => {
    const workflow = read(workflowPath);
    expect(workflow).toContain('needs: build-packages');
    expect(workflow).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    expect(workflow).toContain('path: release-assets');
    expect(workflow).toContain('merge-multiple: true');
    expect(workflow).toContain('test "$(find release-assets -mindepth 1 -maxdepth 1 | wc -l)" -eq 4');
    expect(workflow).toContain('for asset in "${assets[@]}"; do');
    expect(workflow).toContain('test -f "$asset"');
    expect(workflow).toContain('test -s "$asset"');
    for (const asset of releaseAssets) expect(workflow).toContain(`release-assets/${asset}`);
    expect(workflow).toContain('"${assets[@]}"');
  });

  it('fails closed when checking for an existing tag or release', () => {
    const workflow = read(workflowPath);
    expect(workflow).toContain('git ls-remote --exit-code --tags origin "refs/tags/$TAG"');
    expect(workflow).toContain('tag_status=$?');
    expect(workflow).toContain('case "$tag_status" in');
    expect(workflow).toContain('gh api --include "/repos/$GITHUB_REPOSITORY/releases/tags/$TAG"');
    expect(workflow).toContain('release_status=$?');
    expect(workflow).toContain('case "$http_status:$release_status" in');
    expect(workflow).toContain('404:*)');
    expect(workflow).not.toContain('gh release view "$TAG"');
    expect(workflow).toContain('gh release create "$TAG"');
    expect(workflow).toContain('--target "$GITHUB_SHA"');
    expect(workflow).toContain('--notes-file RELEASE_NOTES.md');
    expect(workflow).not.toContain('--prerelease');
  });

  it('parses the GitHub release response status with valid awk syntax', () => {
    const workflow = read(workflowPath);
    const awkProgram = workflow.match(
      /http_status="\$\(awk '([^']+)' "\$release_response"\)"/
    )?.[1];
    expect(awkProgram).toBe('/^HTTP\\// { status=$2 } END { print status }');

    if (process.platform !== 'win32' && awkProgram) {
      const result = spawnSync('awk', [awkProgram], {
        cwd: process.cwd(),
        encoding: 'utf8',
        input: 'HTTP/2.0 404 Not Found\n'
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('404');
    }
  });
});
