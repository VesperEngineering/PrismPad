import { describe, expect, it } from 'vitest';
import type { ExternalChangePrompt } from '../src/lib/controllers/external-changes';
import { createExternalPromptQueue, type ExternalPromptQueueState } from '../src/lib/controllers/external-prompt-queue';

const change = (id: string, path: string, diskText = `${id} disk\n`): ExternalChangePrompt => ({
  documentId: id,
  path,
  editorText: `${id} editor\n`,
  source: {
    id,
    path,
    text: `${id} editor\n`,
    dirty: true,
    modifiedMs: 1,
    size: 1,
    revision: `${id}-source`
  },
  disk: {
    path,
    text: diskText,
    encoding: 'utf-8',
    bom: false,
    lineEnding: 'lf',
    modifiedMs: diskText.length,
    size: diskText.length,
    revision: `${id}-${diskText}`,
    large: false
  }
});

describe('external prompt queue', () => {
  it('keeps A visible until resolved, then advances to B', () => {
    let state: ExternalPromptQueueState | null = null;
    const queue = createExternalPromptQueue({ onChange: (next) => (state = next) });
    const a = change('a', '/tmp/a.txt');
    const b = change('b', '/tmp/b.txt');

    queue.enqueue(a);
    queue.enqueue(b);
    expect(state).toEqual({ current: a, comparing: false });

    expect(queue.resolveCurrent()).toEqual(a);
    expect(state).toEqual({ current: b, comparing: false });
  });

  it('coalesces a newer unresolved change for the same document and path', () => {
    let state: ExternalPromptQueueState | null = null;
    const queue = createExternalPromptQueue({ onChange: (next) => (state = next) });
    const first = change('a', '/tmp/a.txt', 'first\n');
    const newest = change('a', '/tmp/a.txt', 'newest\n');

    queue.enqueue(first);
    queue.enqueue(change('b', '/tmp/b.txt'));
    queue.enqueue(newest);

    expect(state).toEqual({ current: newest, comparing: false });
    expect(queue.resolveCurrent()).toEqual(newest);
    expect(state).toEqual({ current: change('b', '/tmp/b.txt'), comparing: false });
  });

  it('does not resolve a newer same-path prompt while an older reload is pending', () => {
    let state: ExternalPromptQueueState | null = null;
    const queue = createExternalPromptQueue({ onChange: (next) => (state = next) });
    const older = change('a', '/tmp/a.txt', 'older\n');
    const newer = change('a', '/tmp/a.txt', 'newer\n');

    queue.enqueue(older);
    expect(queue.isCurrent(older)).toBe(true);
    queue.enqueue(newer);

    expect(queue.isCurrent(older)).toBe(false);
    expect(queue.isCurrent(newer)).toBe(true);
    expect(queue.resolveCurrent(older)).toBeNull();
    expect(state).toEqual({ current: newer, comparing: false });
  });

  it('invalidates every cached prompt for a path after an external read fails', () => {
    let state: ExternalPromptQueueState | null = null;
    const queue = createExternalPromptQueue({ onChange: (next) => (state = next) });
    const a = change('a', '/tmp/a.txt');
    const b = change('b', '/tmp/b.txt');

    queue.enqueue(a);
    queue.enqueue(b);
    queue.invalidatePath('/tmp/a.txt');

    expect(state).toEqual({ current: b, comparing: false });
  });

  it('returns from comparison to the same unresolved choice without mounting both modals', () => {
    const states: ExternalPromptQueueState[] = [];
    const queue = createExternalPromptQueue({ onChange: (next) => states.push(next) });
    const a = change('a', '/tmp/a.txt');

    queue.enqueue(a);
    expect(queue.beginCompare()).toEqual(a);
    expect(states.at(-1)).toEqual({ current: a, comparing: true });
    const visibleExternal = (state: ExternalPromptQueueState) => state.current !== null && !state.comparing;
    const visibleComparison = (state: ExternalPromptQueueState) => state.current !== null && state.comparing;
    expect(visibleExternal(states.at(-1)!)).toBe(false);
    expect(visibleComparison(states.at(-1)!)).toBe(true);

    queue.closeCompare();
    expect(states.at(-1)).toEqual({ current: a, comparing: false });
    expect(queue.resolveCurrent()).toEqual(a);
    expect(states.at(-1)).toEqual({ current: null, comparing: false });
  });

  it('drops prompts whose document no longer owns the path before advancing', () => {
    let bIsOpen = true;
    let state: ExternalPromptQueueState | null = null;
    const a = change('a', '/tmp/a.txt');
    const b = change('b', '/tmp/b.txt');
    const queue = createExternalPromptQueue({
      isCurrent: (candidate) => candidate.documentId !== 'b' || bIsOpen,
      onChange: (next) => (state = next)
    });

    queue.enqueue(a);
    queue.enqueue(b);
    bIsOpen = false;
    queue.resolveCurrent();

    expect(state).toEqual({ current: null, comparing: false });
  });

  it('drops a prompt when its captured editor or save baseline no longer matches', () => {
    let revision = 'a-source';
    let text = 'a editor\n';
    let state: ExternalPromptQueueState | null = null;
    const prompt = change('a', '/tmp/a.txt');
    const queue = createExternalPromptQueue({
      isCurrent: (candidate) => candidate.source.revision === revision && candidate.source.text === text,
      onChange: (next) => (state = next)
    });

    queue.enqueue(prompt);
    revision = 'saved-r2';
    text = 'saved\n';
    queue.reconcile();

    expect(state).toEqual({ current: null, comparing: false });
  });
});
