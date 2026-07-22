import { describe, expect, it, vi } from 'vitest';
import { restoreSession, serializeSession, validateSession } from '../src/lib/native/store-api';

describe('session state', () => {
  it('serializes paths and view state but never document contents', () => {
    const session = serializeSession({
      activeId: 'a',
      documents: [
        { id: 'a', path: '/tmp/a.py', text: 'secret', savedText: 'also secret', anchor: 3, head: 3 },
        { id: 'b', path: null, text: 'untitled secret', savedText: '', anchor: 0, head: 0 }
      ]
    });

    expect(JSON.stringify(session)).not.toContain('secret');
    expect(session.tabs).toEqual([{ path: '/tmp/a.py', anchor: 3, head: 3 }]);
    expect(session.activePath).toBe('/tmp/a.py');
  });

  it('validates versioned sessions and ignores malformed tabs', () => {
    expect(validateSession({
      version: 1,
      activePath: '/tmp/a.py',
      tabs: [{ path: '/tmp/a.py', anchor: 2, head: 4 }, { path: 2, anchor: 0, head: 0 }]
    })).toEqual({ version: 1, activePath: '/tmp/a.py', tabs: [{ path: '/tmp/a.py', anchor: 2, head: 4 }] });
    expect(validateSession({ version: 2, tabs: [] })).toBeNull();
  });

  it('restores paths sequentially and summarizes unreadable files', async () => {
    const readFile = vi.fn(async (path: string) => {
      if (path === '/tmp/missing.py') {
        throw new Error('missing');
      }
      return { path, text: 'print(1)\n', encoding: 'utf-8' as const, bom: false, lineEnding: 'lf' as const, modifiedMs: 1, size: 9, revision: 'r', large: false };
    });

    const result = await restoreSession({
      version: 1,
      activePath: '/tmp/a.py',
      tabs: [
        { path: '/tmp/a.py', anchor: 3, head: 4 },
        { path: '/tmp/missing.py', anchor: 0, head: 0 },
        { path: '/tmp/b.py', anchor: 1, head: 1 }
      ]
    }, readFile);

    expect(readFile.mock.calls.map(([path]) => path)).toEqual(['/tmp/a.py', '/tmp/missing.py', '/tmp/b.py']);
    expect(result.files.map(({ file }) => file.path)).toEqual(['/tmp/a.py', '/tmp/b.py']);
    expect(result.skipped).toEqual(['/tmp/missing.py']);
    expect(result.activePath).toBe('/tmp/a.py');
  });
});
