import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { ask, open, save } from '@tauri-apps/plugin-dialog';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), open: vi.fn(), save: vi.fn() }));

import {
  chooseOpenPaths,
  chooseSavePath,
  confirmLargeFile,
  openFile,
  saveFile,
  subscribeToFileDrops,
  type WriteFileRequest
} from '../src/lib/native/file-api';

describe('native file API', () => {
  it('uses the restricted read command with an explicit large-file gate', async () => {
    vi.mocked(invoke).mockResolvedValue({
      path: 'C:\\x.py',
      text: 'x=1\n',
      encoding: 'utf-8',
      bom: false,
      lineEnding: 'lf',
      modifiedMs: 7,
      size: 4,
      revision: 'f65e56300404de6b',
      large: false
    });

    await expect(openFile('C:\\x.py')).resolves.toMatchObject({ path: 'C:\\x.py', lineEnding: 'lf' });
    expect(invoke).toHaveBeenCalledWith('read_text_file', { path: 'C:\\x.py', allowLarge: false });
  });

  it('passes the typed save request to the restricted write command', async () => {
    const request: WriteFileRequest = {
      path: '/tmp/note.txt',
      text: 'a\nb\n',
      bom: true,
      lineEnding: 'crlf',
      expectedModifiedMs: 12,
      expectedSize: 4,
      expectedRevision: 'f65e56300404de6b',
      overwriteExisting: false
    };
    vi.mocked(invoke).mockResolvedValue({
      path: '/tmp/note.txt',
      modifiedMs: 18,
      size: 9,
      revision: 'c5f11eb3c5d17c9d'
    });

    await expect(saveFile(request)).resolves.toEqual({
      path: '/tmp/note.txt',
      modifiedMs: 18,
      size: 9,
      revision: 'c5f11eb3c5d17c9d'
    });
    expect(invoke).toHaveBeenCalledWith('write_text_file', { request });
  });

  it('uses native dialogs for multi-file open, save locations, and large-file confirmation', async () => {
    vi.mocked(open).mockResolvedValue(['/tmp/a.py', '/tmp/b.md']);
    vi.mocked(save).mockResolvedValue('/tmp/Untitled.py');
    vi.mocked(ask).mockResolvedValue(true);

    await expect(chooseOpenPaths()).resolves.toEqual(['/tmp/a.py', '/tmp/b.md']);
    await expect(chooseSavePath('Untitled.py')).resolves.toBe('/tmp/Untitled.py');
    await expect(confirmLargeFile('/tmp/big.txt', 21 * 1024 * 1024)).resolves.toBe(true);

    expect(open).toHaveBeenCalledWith({ directory: false, multiple: true });
    expect(save).toHaveBeenCalledWith({ defaultPath: 'Untitled.py' });
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('/tmp/big.txt is 21.0 MiB'), {
      title: 'Open large file',
      kind: 'warning'
    });
  });

  it('subscribes once to native drops and forwards only dropped file paths', async () => {
    const onDrop = vi.fn();
    const unlisten = vi.fn();
    let listener: ((event: { payload: { type: string; paths?: string[] } }) => void) | undefined;
    vi.mocked(getCurrentWebview).mockReturnValue({
      onDragDropEvent: vi.fn(async (nextListener) => {
        listener = nextListener as typeof listener;
        return unlisten;
      })
    } as never);
    Object.assign(window, { __TAURI_INTERNALS__: {} });

    const stop = await subscribeToFileDrops(onDrop);
    listener?.({ payload: { type: 'over' } });
    listener?.({ payload: { type: 'drop', paths: ['/tmp/a.py'] } });

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(['/tmp/a.py']);
    stop();
    expect(unlisten).toHaveBeenCalledOnce();
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });
});
