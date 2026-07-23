import { expect, it, vi } from 'vitest';
import { createPathWatchController } from '../src/lib/controllers/external-changes';

it('watches each open canonical path once and unwatches it after the final tab closes', async () => {
  let paths = ['/tmp/a.txt', '/tmp/a.txt'];
  const watch = vi.fn(async () => undefined);
  const unwatch = vi.fn(async () => undefined);
  const controller = createPathWatchController({ paths: () => paths, watch, unwatch });

  await controller.sync();
  paths = [];
  await controller.sync();

  expect(watch).toHaveBeenCalledTimes(1);
  expect(watch).toHaveBeenCalledWith('/tmp/a.txt');
  expect(unwatch).toHaveBeenCalledTimes(1);
  expect(unwatch).toHaveBeenCalledWith('/tmp/a.txt');
});

it('unwatches every remaining path during teardown', async () => {
  let paths = ['/tmp/a.txt', '/tmp/b.txt'];
  const unwatch = vi.fn(async () => undefined);
  const controller = createPathWatchController({ paths: () => paths, watch: vi.fn(async () => undefined), unwatch });

  await controller.sync();
  await controller.dispose();
  paths = [];
  await controller.sync();

  expect(unwatch).toHaveBeenCalledTimes(2);
  expect(unwatch).toHaveBeenCalledWith('/tmp/a.txt');
  expect(unwatch).toHaveBeenCalledWith('/tmp/b.txt');
});

it('attempts every teardown unwatch even when an earlier cleanup fails', async () => {
  const unwatch = vi.fn(async (path: string) => {
    if (path === '/tmp/a.txt') {
      throw new Error('denied');
    }
  });
  const controller = createPathWatchController({
    paths: () => ['/tmp/a.txt', '/tmp/b.txt'], watch: vi.fn(async () => undefined), unwatch
  });
  await controller.sync();

  await expect(controller.dispose()).rejects.toThrow('Unable to stop every file watcher');

  expect(unwatch).toHaveBeenCalledWith('/tmp/a.txt');
  expect(unwatch).toHaveBeenCalledWith('/tmp/b.txt');
});
