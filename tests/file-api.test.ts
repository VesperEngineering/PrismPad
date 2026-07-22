import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { openFile, saveFile, type WriteFileRequest } from '../src/lib/native/file-api';

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
      expectedRevision: 'f65e56300404de6b'
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
});
