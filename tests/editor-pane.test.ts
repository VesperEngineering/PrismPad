import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import EditorPane from '../src/lib/components/EditorPane.svelte';
import { createPrismEditor } from '../src/lib/editor/create-editor';
import type { DocumentRecord } from '../src/lib/domain/document';

const documentRecord = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'python-document',
  title: 'example.py',
  path: null,
  text: 'print("first")\n',
  savedText: 'print("first")\n',
  language: 'python',
  encoding: 'utf-8',
  bom: false,
  lineEnding: 'lf',
  modifiedMs: null,
  size: 15,
  revision: null,
  dirty: false,
  anchor: 0,
  head: 0,
  ...overrides
});

describe('EditorPane', () => {
  it('renders the active document in one CodeMirror editor', () => {
    render(EditorPane, {
      document: documentRecord(),
      dark: false,
      onTextChange: vi.fn(),
      onCursorChange: vi.fn(),
      onNotice: vi.fn()
    });

    expect(screen.getByRole('textbox')).toHaveTextContent('print("first")');
  });

  it('retains each document text and selection while switching the mounted editor', () => {
    const host = document.createElement('div');
    const first = documentRecord({ id: 'first', text: 'first', savedText: 'first' });
    const second = documentRecord({ id: 'second', text: 'second', savedText: 'second' });
    const editor = createPrismEditor({
      parent: host,
      document: first,
      dark: false,
      onTextChange: vi.fn(),
      onCursorChange: vi.fn(),
      onNotice: vi.fn()
    });

    editor.getView().dispatch({ changes: { from: 5, insert: ' document' }, selection: { anchor: 3 } });
    editor.replaceDocument(second);
    editor.getView().dispatch({ changes: { from: 6, insert: ' document' }, selection: { anchor: 4 } });
    editor.replaceDocument(first);

    expect(host.querySelectorAll('.cm-editor')).toHaveLength(1);
    expect(editor.getView().state.doc.toString()).toBe('first document');
    expect(editor.getView().state.selection.main.anchor).toBe(3);
    editor.destroy();
  });
});
