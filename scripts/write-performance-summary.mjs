#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const values = (file) => existsSync(file)
  ? readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(Number).filter(Number.isFinite)
  : [];

const median = (numbers) => {
  const sorted = [...numbers].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const platform = argument('--platform') ?? process.platform;
const launch = values(resolve(argument('--launch-ms') ?? 'artifacts/launch-ms.txt'));
const rss = values(resolve(argument('--idle-rss-kb') ?? 'artifacts/idle-rss-kb.txt'));
const artifactLines = values(resolve(argument('--artifact-bytes') ?? 'artifacts/artifact-bytes.txt'));
const unavailable = [];
if (launch.length !== 5) unavailable.push(`time-to-welcome unavailable: expected five launches, received ${launch.length}`);
if (rss.length !== 1) unavailable.push(`idle RSS unavailable: expected one measurement after 30 seconds, received ${rss.length}`);
if (artifactLines.length === 0) unavailable.push('artifact sizes unavailable: no bundle files were measured');

const report = {
  platform,
  launchCount: launch.length,
  medianTimeToWelcomeMs: launch.length === 5 ? median(launch) : null,
  idleRssKb: rss.length === 1 ? rss[0] : null,
  artifactBytes: artifactLines,
  unavailable
};

const baselinePath = resolve(argument('--baseline') ?? 'ci/performance-baselines.json');
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8'))[platform] : undefined;
const regressions = [];
for (const [metric, current] of [
  ['medianTimeToWelcomeMs', report.medianTimeToWelcomeMs],
  ['idleRssKb', report.idleRssKb]
]) {
  const previous = baseline?.[metric];
  if (typeof previous === 'number' && typeof current === 'number' && current > previous * 1.2) {
    regressions.push(`${metric} increased by more than 20% (${previous} → ${current})`);
  }
}

mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/performance.json', `${JSON.stringify(report, null, 2)}\n`);

const summary = [
  '## PrismPad performance report',
  '',
  `Platform: \`${platform}\``,
  '',
  '| Metric | Result |',
  '| --- | ---: |',
  `| Five-launch median time-to-welcome | ${report.medianTimeToWelcomeMs === null ? 'unavailable' : `${report.medianTimeToWelcomeMs} ms`} |`,
  `| Idle RSS after 30 seconds | ${report.idleRssKb === null ? 'unavailable' : `${report.idleRssKb} KiB`} |`,
  `| Bundle artifact bytes | ${artifactLines.length === 0 ? 'unavailable' : artifactLines.join(', ')} |`
];
if (unavailable.length) summary.push('', ...unavailable.map((message) => `- ⚠️ ${message}`));
if (regressions.length) summary.push('', ...regressions.map((message) => `- ⚠️ Performance warning: ${message}`));
const output = `${summary.join('\n')}\n`;
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, output, { flag: 'a' });
else process.stdout.write(output);
if (unavailable.length) {
  console.error(unavailable.join('\n'));
  process.exitCode = 1;
}
