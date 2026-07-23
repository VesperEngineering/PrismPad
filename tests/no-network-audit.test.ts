import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isProductionOutputPath, normalizedPath } from '../scripts/network-audit-path.mjs';

const runAudit = (target: string) => spawnSync(
  process.execPath,
  ['scripts/assert-no-network.mjs', target],
  { cwd: process.cwd(), encoding: 'utf8' }
);

const fixture = (): string => mkdtempSync(join(tmpdir(), 'prismpad-network-audit-'));

describe('assert-no-network', () => {
  it('accepts production code while ignoring source maps and documentation', () => {
    const directory = fixture();
    try {
      mkdirSync(join(directory, 'assets'));
      writeFileSync(join(directory, 'assets', 'safe.js'), 'export const greeting = "Hello";');
      writeFileSync(join(directory, 'assets', 'safe.js.map'), '{"sourcesContent":["fetch(\\\"https://ignored.test\\\")"]}');
      writeFileSync(join(directory, 'README.md'), 'https://ignored.test is documentation.');

      const result = runAudit(directory);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No unexpected network APIs found.');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects runtime network APIs and remote destinations with file-specific findings', () => {
    const directory = fixture();
    try {
      writeFileSync(
        join(directory, 'unsafe.js'),
        'fetch("https://example.test/api"); new WebSocket("wss://example.test/socket"); navigator.sendBeacon("https://example.test/beacon");'
      );

      const result = runAudit(directory);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unsafe.js');
      expect(result.stderr).toContain('fetch');
      expect(result.stderr).toContain('WebSocket');
      expect(result.stderr).toContain('sendBeacon');
      expect(result.stderr).toContain('remote destination');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('audits Rust and JSON sources and normalizes Windows-style paths in findings', () => {
    const directory = fixture();
    try {
      mkdirSync(join(directory, 'src-tauri', 'src'), { recursive: true });
      writeFileSync(join(directory, 'src-tauri', 'src', 'unsafe.rs'), 'reqwest::get("https://example.test/native");');
      writeFileSync(join(directory, 'runtime.json'), '{"endpoint":"https://example.test/runtime"}');

      const result = runAudit(directory);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('src-tauri/src/unsafe.rs');
      expect(result.stderr).toContain('runtime.json');
      expect(normalizedPath('src-tauri\\src\\unsafe.rs')).toBe('src-tauri/src/unsafe.rs');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects loopback transports outside the exact Tauri config allowlist', () => {
    const directory = fixture();
    try {
      writeFileSync(join(directory, 'unsafe.ts'), 'const endpoint = "http://127.0.0.1:9911";');

      const result = runAudit(directory);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('remote destination');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not treat an arbitrary local-asset-shaped fetch as trusted generated tooling', () => {
    const directory = fixture();
    try {
      writeFileSync(join(directory, 'unsafe.js'), 'fetch(e.href,n);');

      const result = runAudit(directory);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('fetch');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('normalizes a Windows-style dist path for generated and vendor allowances without hiding transport', () => {
    const dist = join(process.cwd(), 'dist');
    mkdirSync(dist, { recursive: true });
    const directory = mkdtempSync(join(dist, 'prismpad-network-audit-'));
    try {
      mkdirSync(join(directory, 'assets'));
      const bundle = join(directory, 'assets', 'bundle.js');
      expect(isProductionOutputPath('dist\\assets\\bundle.js')).toBe(true);
      writeFileSync(bundle, [
        'const vendorDocumentation = "https://errors.example.invalid/reference";',
        'if(e.ep)return;e.ep=!0;let n=r(e);fetch(e.href,n)'
      ].join('\n'));

      const safe = runAudit(directory);

      expect(safe.status).toBe(0);
      expect(safe.stdout).toContain('No unexpected network APIs found.');

      writeFileSync(bundle, [
        'const vendorDocumentation = "https://errors.example.invalid/reference";',
        'if(e.ep)return;e.ep=!0;let n=r(e);fetch(e.href,n)',
        'new WebSocket("wss://example.test/socket");'
      ].join('\n'));

      const unsafe = runAudit(directory);

      expect(unsafe.status).toBe(1);
      expect(unsafe.stderr).toContain('assets/bundle.js');
      expect(unsafe.stderr).toContain('WebSocket');
      expect(unsafe.stderr).toContain('remote destination');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('ignores capability schema metadata but rejects HTTP and shell permission grants', () => {
    const directory = fixture();
    const capabilities = join(directory, 'src-tauri', 'capabilities');
    mkdirSync(capabilities, { recursive: true });
    try {
      const capability = join(capabilities, 'default.json');
      writeFileSync(capability, JSON.stringify({
        $schema: 'https://schema.tauri.app/capability.json',
        identifier: 'default',
        windows: ['main'],
        permissions: ['core:default', 'dialog:default', 'store:default']
      }));

      const safe = runAudit(capabilities);

      expect(safe.status).toBe(0);

      writeFileSync(capability, JSON.stringify({
        $schema: 'https://schema.tauri.app/capability.json',
        identifier: 'unsafe',
        permissions: [
          'http:default',
          { identifier: 'shell:allow-execute', allow: [{ name: 'curl', cmd: 'curl' }] }
        ]
      }));

      const unsafe = runAudit(capabilities);

      expect(unsafe.status).toBe(1);
      expect(unsafe.stderr).toContain('network-enabling capability permission: http:default');
      expect(unsafe.stderr).toContain('network-enabling capability permission: shell:allow-execute');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects XHR, EventSource, dynamic remote imports, and remote workers', () => {
    const directory = fixture();
    try {
      writeFileSync(join(directory, 'unsafe.js'), [
        'new XMLHttpRequest();',
        'new EventSource("https://example.test/events");',
        'import("https://example.test/module.js");',
        'new Worker("https://example.test/worker.js");'
      ].join('\n'));

      const result = runAudit(directory);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('XMLHttpRequest');
      expect(result.stderr).toContain('EventSource');
      expect(result.stderr).toContain('dynamic remote import');
      expect(result.stderr).toContain('remote worker');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
