import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertReleaseVersion } from '../scripts/assert-release-version.mjs';

const roots: string[] = [];

const fixture = (versions: { packageJson: string; cargo: string; tauri: string }): string => {
  const root = mkdtempSync(join(tmpdir(), 'prismpad-release-version-'));
  roots.push(root);
  mkdirSync(join(root, 'src-tauri'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: versions.packageJson }));
  writeFileSync(
    join(root, 'src-tauri', 'Cargo.toml'),
    `[package]\nname = "prism-pad"\nversion = "${versions.cargo}"\n`
  );
  writeFileSync(
    join(root, 'src-tauri', 'tauri.conf.json'),
    JSON.stringify({ productName: 'PrismPad', version: versions.tauri })
  );
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('release version assertion', () => {
  it('accepts one exact version across all release manifests', () => {
    const root = fixture({ packageJson: '0.1.0', cargo: '0.1.0', tauri: '0.1.0' });
    expect(() => assertReleaseVersion(root, '0.1.0')).not.toThrow();
  });

  it.each([
    ['package.json', { packageJson: '0.1.1', cargo: '0.1.0', tauri: '0.1.0' }],
    ['src-tauri/Cargo.toml', { packageJson: '0.1.0', cargo: '0.1.1', tauri: '0.1.0' }],
    ['src-tauri/tauri.conf.json', { packageJson: '0.1.0', cargo: '0.1.0', tauri: '0.1.1' }]
  ])('rejects a mismatched %s version', (path, versions) => {
    const root = fixture(versions);
    expect(() => assertReleaseVersion(root, '0.1.0')).toThrow(`${path} version`);
  });

  it('rejects a missing expected version', () => {
    const root = fixture({ packageJson: '0.1.0', cargo: '0.1.0', tauri: '0.1.0' });
    expect(() => assertReleaseVersion(root, '')).toThrow('Expected release version is required');
  });
});
