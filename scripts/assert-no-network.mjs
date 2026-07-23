#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { isProductionOutputPath, normalizedPath } from './network-audit-path.mjs';

const sourceExtensions = new Set(['.cjs', '.html', '.js', '.json', '.jsx', '.mjs', '.rs', '.svelte', '.ts', '.tsx']);
const ignoredDirectories = new Set(['.git', '.superpowers', 'node_modules']);

const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;

/** Removes comments without mistaking protocol separators inside string literals for comments. */
const withoutComments = (source) => {
  let output = '';
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      output += character;
      continue;
    }

    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        output += ' ';
        index += 1;
      }
      if (index < source.length) output += '\n';
      continue;
    }

    if (character === '/' && next === '*') {
      output += '  ';
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        output += source[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      output += ' ';
      index += 1;
      continue;
    }

    output += character;
  }

  return output;
};

const filesIn = (target) => {
  if (!existsSync(target)) throw new Error(`Audit target does not exist: ${target}`);
  const stat = statSync(target);
  if (stat.isFile()) return [target];

  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(target, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : filesIn(child);
    if (entry.isFile() && entry.name.endsWith('.map')) return [];
    return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [child] : [];
  });
};

const addMatches = (findings, root, file, source, expression, label) => {
  for (const match of source.matchAll(expression)) {
    findings.push({ file: normalizedPath(relative(root, file) || file), line: lineAt(source, match.index), label });
  }
};

const auditSource = (root, file, source, findings) => {
  let runtime = withoutComments(source);
  const repositoryPath = normalizedPath(relative(root, file));
  if (isProductionOutputPath(repositoryPath)) {
    // Vite's generated module-preload helper resolves only bundled link hrefs.
    // Match the whole generated control-flow shape, never an arbitrary fetch.
    runtime = runtime.replace(
      /if\((\w+)\.ep\)return;\1\.ep=!0;let (\w+)=\w+\(\1\);fetch\(\1\.href,\2\)/g,
      ''
    );
  }
  addMatches(findings, root, file, runtime, /\b(?:globalThis\.|window\.)?fetch\s*\(/g, 'fetch');
  addMatches(findings, root, file, runtime, /\b(?:window\.)?XMLHttpRequest\b/g, 'XMLHttpRequest');
  addMatches(findings, root, file, runtime, /\b(?:window\.)?WebSocket\b/g, 'WebSocket');
  addMatches(findings, root, file, runtime, /\b(?:window\.)?EventSource\b/g, 'EventSource');
  addMatches(findings, root, file, runtime, /\bnavigator\.sendBeacon\s*\(/g, 'sendBeacon');
  addMatches(findings, root, file, runtime, /\bimport\s*\(\s*["'`](?:https?|wss?):\/\//g, 'dynamic remote import');
  addMatches(findings, root, file, runtime, /\bnew\s+(?:Shared)?Worker\s*\(\s*["'`](?:https?|wss?):\/\//g, 'remote worker');
  addMatches(findings, root, file, runtime, /\b(?:reqwest|ureq|hyper)::|\bTcpStream::connect\b|\bUdpSocket::(?:bind|connect)\b/g, 'Rust network API');
  // Source is our policy boundary, so every literal remote URL is reviewed.
  // Bundled dependencies carry error-document URLs and XML namespaces that are
  // not network destinations; in production output inspect URLs only when they
  // are used by a runtime transport expression.
  if (isProductionOutputPath(repositoryPath)) {
    addMatches(findings, root, file, runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import|Worker)\b[^;\n]{0,320}\b(?:https?|wss?):\/\//g, 'remote destination');
  } else {
    addMatches(findings, root, file, runtime, /\b(?:https?|wss?):\/\//g, 'remote destination');
  }
};

const auditCapabilityConfig = (root, file, findings) => {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const permissions = Array.isArray(config.permissions) ? config.permissions : [];
  for (const permission of permissions) {
    const identifier = typeof permission === 'string' ? permission : permission?.identifier;
    if (typeof identifier === 'string' && /^(?:http|shell):/.test(identifier)) {
      findings.push({
        file: normalizedPath(relative(root, file)),
        line: 1,
        label: `network-enabling capability permission: ${identifier}`
      });
    }
  }

  const runtimeConfig = structuredClone(config);
  delete runtimeConfig.$schema;
  auditSource(root, file, JSON.stringify(runtimeConfig), findings);
};

const auditTauriConfig = (root, file, findings) => {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const runtimeConfig = structuredClone(config);
  delete runtimeConfig.$schema;

  if (runtimeConfig.build?.devUrl !== 'http://localhost:1420') {
    findings.push({ file: normalizedPath(relative(root, file)), line: 1, label: 'non-local Tauri devUrl' });
  }

  const csp = runtimeConfig.app?.security?.csp;
  if (typeof csp !== 'string' || !/connect-src\s+ipc:\s+http:\/\/ipc\.localhost(?:;|$)/.test(csp)) {
    findings.push({ file: normalizedPath(relative(root, file)), line: 1, label: 'unexpected Tauri IPC CSP' });
  }

  delete runtimeConfig.build?.devUrl;
  if (runtimeConfig.app?.security) {
    runtimeConfig.app.security.csp = runtimeConfig.app.security.csp?.replace('http://ipc.localhost', '');
  }
  auditSource(root, file, JSON.stringify(runtimeConfig), findings);
};

const main = () => {
  const root = process.cwd();
  const targets = process.argv.slice(2);
  const resolvedTargets = targets.length > 0
    ? targets.map((target) => resolve(root, target))
    : ['dist', 'src', 'src-tauri/src', 'src-tauri/capabilities', 'src-tauri/tauri.conf.json']
      .map((target) => resolve(root, target));
  const findings = [];

  for (const target of resolvedTargets) {
    for (const file of filesIn(target)) {
      const normalizedFile = normalizedPath(file);
      if (normalizedFile.endsWith('/src-tauri/tauri.conf.json')) auditTauriConfig(root, file, findings);
      else if (normalizedFile.includes('/src-tauri/capabilities/') && normalizedFile.endsWith('.json')) {
        auditCapabilityConfig(root, file, findings);
      }
      else auditSource(root, file, readFileSync(file, 'utf8'), findings);
    }
  }

  if (findings.length > 0) {
    console.error('Unexpected runtime network access found:');
    for (const finding of findings) console.error(`- ${finding.file}:${finding.line} ${finding.label}`);
    process.exitCode = 1;
    return;
  }

  console.log('No unexpected network APIs found.');
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
