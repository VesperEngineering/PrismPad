import { EditorState, type Extension } from '@codemirror/state';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadLanguageMock } = vi.hoisted(() => ({ loadLanguageMock: vi.fn() }));

vi.mock('../src/lib/editor/extensions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/editor/extensions')>();
  return { ...actual, loadLanguage: loadLanguageMock };
});

import { createPrismEditor } from '../src/lib/editor/create-editor';
import type { DocumentRecord } from '../src/lib/domain/document';

const record = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'first',
  title: 'first.py',
  path: null,
  text: 'first',
  savedText: 'first',
  language: 'plain',
  encoding: 'utf-8',
  bom: false,
  lineEnding: 'lf',
  modifiedMs: null,
  size: 5,
  revision: null,
  dirty: false,
  anchor: 0,
  head: 0,
  ...overrides
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('PrismEditor lifecycle', () => {
  beforeEach(() => loadLanguageMock.mockReset());

  it('reconciles same-active external text and selection without emitting editor callbacks', () => {
    const onTextChange = vi.fn();
    const onCursorChange = vi.fn();
    const editor = createPrismEditor({
      parent: document.createElement('div'),
      document: record(),
      dark: false,
      onTextChange,
      onCursorChange,
      onNotice: vi.fn()
    });

    editor.replaceDocument(record({ text: 'external text', savedText: 'external text', anchor: 3, head: 8 }));

    expect(editor.getView().state.doc.toString()).toBe('external text');
    expect(editor.getView().state.selection.main).toMatchObject({ anchor: 3, head: 8 });
    expect(onTextChange).not.toHaveBeenCalled();
    expect(onCursorChange).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('recognizes a document-store echo of a user edit without synchronizing it again', () => {
    const onTextChange = vi.fn();
    const onCursorChange = vi.fn();
    const editor = createPrismEditor({
      parent: document.createElement('div'),
      document: record(),
      dark: false,
      onTextChange,
      onCursorChange,
      onNotice: vi.fn()
    });

    editor.getView().dispatch({ changes: { from: 5, insert: '!' }, selection: { anchor: 2 } });
    onTextChange.mockClear();
    onCursorChange.mockClear();
    editor.replaceDocument(record({ text: 'first!', savedText: 'first', dirty: true, anchor: 2, head: 2 }));

    expect(editor.getView().state.doc.toString()).toBe('first!');
    expect(editor.getView().state.selection.main.anchor).toBe(2);
    expect(onTextChange).not.toHaveBeenCalled();
    expect(onCursorChange).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('reconciles a cached document record before switching it back into the mounted editor', () => {
    const onTextChange = vi.fn();
    const onCursorChange = vi.fn();
    const first = record();
    const second = record({ id: 'second', title: 'second.txt', text: 'second', savedText: 'second' });
    const editor = createPrismEditor({
      parent: document.createElement('div'),
      document: first,
      dark: false,
      onTextChange,
      onCursorChange,
      onNotice: vi.fn()
    });

    editor.replaceDocument(second);
    editor.replaceDocument(first);
    editor.replaceDocument(record({ id: 'second', title: 'second.txt', text: 'changed elsewhere', savedText: 'changed elsewhere', anchor: 4, head: 11 }));

    expect(editor.getView().state.doc.toString()).toBe('changed elsewhere');
    expect(editor.getView().state.selection.main).toMatchObject({ anchor: 4, head: 11 });
    expect(onTextChange).not.toHaveBeenCalled();
    expect(onCursorChange).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('ignores a stale language success after the document language changes', async () => {
    const python = deferred<Extension>();
    const json = deferred<Extension>();
    const onNotice = vi.fn();
    loadLanguageMock.mockImplementationOnce(() => python.promise).mockImplementationOnce(() => json.promise);
    const editor = createPrismEditor({
      parent: document.createElement('div'),
      document: record({ language: 'python' }),
      dark: false,
      onTextChange: vi.fn(),
      onCursorChange: vi.fn(),
      onNotice
    });

    editor.replaceDocument(record({ language: 'json' }));
    python.resolve(EditorState.tabSize.of(9));
    await flushPromises();

    expect(onNotice).not.toHaveBeenCalled();
    expect(editor.getView().state.facet(EditorState.tabSize)).toBe(2);
    json.resolve(EditorState.tabSize.of(7));
    await flushPromises();
    expect(editor.getView().state.facet(EditorState.tabSize)).toBe(7);
    editor.destroy();
  });

  it('ignores a stale language rejection after the document language changes', async () => {
    const python = deferred<Extension>();
    const json = deferred<Extension>();
    const onNotice = vi.fn();
    loadLanguageMock.mockImplementationOnce(() => python.promise).mockImplementationOnce(() => json.promise);
    const editor = createPrismEditor({
      parent: document.createElement('div'),
      document: record({ language: 'python' }),
      dark: false,
      onTextChange: vi.fn(),
      onCursorChange: vi.fn(),
      onNotice
    });

    editor.replaceDocument(record({ language: 'json' }));
    python.reject(new Error('obsolete language failed'));
    await flushPromises();

    expect(onNotice).not.toHaveBeenCalled();
    json.resolve(EditorState.tabSize.of(7));
    await flushPromises();
    expect(editor.getView().state.facet(EditorState.tabSize)).toBe(7);
    editor.destroy();
  });

  it('does not update or notify after pending language loads settle post-destroy', async () => {
    const pendingSuccess = deferred<Extension>();
    const pendingFailure = deferred<Extension>();
    const onNotice = vi.fn();
    loadLanguageMock.mockReturnValueOnce(pendingSuccess.promise).mockReturnValueOnce(pendingFailure.promise);
    const successfulEditor = createPrismEditor({
      parent: document.createElement('div'),
      document: record({ language: 'python' }),
      dark: false,
      onTextChange: vi.fn(),
      onCursorChange: vi.fn(),
      onNotice
    });
    const failedEditor = createPrismEditor({
      parent: document.createElement('div'),
      document: record({ id: 'second', language: 'json' }),
      dark: false,
      onTextChange: vi.fn(),
      onCursorChange: vi.fn(),
      onNotice
    });

    successfulEditor.destroy();
    failedEditor.destroy();
    pendingSuccess.resolve(EditorState.tabSize.of(9));
    pendingFailure.reject(new Error('destroyed'));
    await flushPromises();

    expect(onNotice).not.toHaveBeenCalled();
  });
});
