import { writeFileSync } from 'node:fs';

describe('PrismPad idle measurement', () => {
  it('keeps a visible packaged application session alive for RSS sampling', async () => {
    const readyFile = process.env.PRISMPAD_IDLE_READY_FILE;
    if (!readyFile) throw new Error('Idle measurement requires PRISMPAD_IDLE_READY_FILE.');
    await expect($('h1=Hello! What will you code in today?')).toBeDisplayed();
    writeFileSync(readyFile, 'ready\n');
    await browser.pause(45_000);
  });
});
