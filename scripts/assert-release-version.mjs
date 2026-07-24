import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @param {string} path */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** @param {string} root @param {string | undefined} expected */
export const assertReleaseVersion = (root, expected) => {
  if (!expected) throw new Error('Expected release version is required');

  const packageVersion = readJson(resolve(root, 'package.json')).version;
  const cargoSource = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
  const cargoVersion = cargoSource.match(/^\s*version\s*=\s*"([^"]+)"\s*$/m)?.[1];
  const tauriVersion = readJson(resolve(root, 'src-tauri/tauri.conf.json')).version;

  const versions = [
    ['package.json', packageVersion],
    ['src-tauri/Cargo.toml', cargoVersion],
    ['src-tauri/tauri.conf.json', tauriVersion]
  ];

  for (const [path, actual] of versions) {
    if (actual !== expected) {
      throw new Error(`${path} version must be ${expected}; received ${actual ?? 'missing'}`);
    }
  }
};

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    assertReleaseVersion(process.cwd(), process.argv[2]);
    console.log(`Release manifests agree on ${process.argv[2]}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
