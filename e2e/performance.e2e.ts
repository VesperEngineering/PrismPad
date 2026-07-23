import { appendFileSync } from 'node:fs';

describe('PrismPad launch measurement', () => {
  it('records time-to-welcome only after the packaged welcome view is visible', async () => {
    const started = Number(process.env.PRISMPAD_LAUNCH_STARTED_MS);
    const output = process.env.PRISMPAD_LAUNCH_METRICS_FILE;
    if (!Number.isFinite(started) || !output) {
      throw new Error('Launch measurement requires PRISMPAD_LAUNCH_STARTED_MS and PRISMPAD_LAUNCH_METRICS_FILE.');
    }
    await expect($('h1=Hello! What will you code in today?')).toBeDisplayed();
    appendFileSync(output, `${Date.now() - started}\n`);
  });
});
