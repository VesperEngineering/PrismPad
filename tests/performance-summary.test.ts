import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runSummary = (directory: string) => spawnSync(
  process.execPath,
  [join(process.cwd(), 'scripts/write-performance-summary.mjs'), '--platform', 'test'],
  { cwd: directory, encoding: 'utf8' }
);

const writeMetrics = (directory: string, metrics: { launch: string; rss?: string; artifacts: string }): void => {
  const artifacts = join(directory, 'artifacts');
  mkdirSync(artifacts);
  writeFileSync(join(artifacts, 'launch-ms.txt'), metrics.launch);
  if (metrics.rss !== undefined) writeFileSync(join(artifacts, 'idle-rss-kb.txt'), metrics.rss);
  writeFileSync(join(artifacts, 'artifact-bytes.txt'), metrics.artifacts);
};

describe('performance summary', () => {
  it('ignores blank metric lines and computes the median from exactly five launches', () => {
    const directory = mkdtempSync(join(tmpdir(), 'prismpad-performance-'));
    try {
      writeMetrics(directory, { launch: '10\n20\n\n30\n40\n50\n', rss: '12345\n', artifacts: '100\n200\n' });

      const result = runSummary(directory);
      const report = JSON.parse(readFileSync(join(directory, 'artifacts', 'performance.json'), 'utf8'));

      expect(result.status).toBe(0);
      expect(report.launchCount).toBe(5);
      expect(report.medianTimeToWelcomeMs).toBe(30);
      expect(report.artifactBytes).toEqual([100, 200]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fails when a required idle RSS measurement is absent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'prismpad-performance-'));
    try {
      writeMetrics(directory, { launch: '10\n20\n30\n40\n50\n', artifacts: '100\n' });

      const result = runSummary(directory);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('idle RSS unavailable');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
