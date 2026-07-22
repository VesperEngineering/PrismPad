import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { loadLanguage, prismPadExtensions } from '../src/lib/editor/extensions';

describe('PrismPad editor extensions', () => {
  it('provides editing fundamentals without an autocomplete source', () => {
    const state = EditorState.create({
      doc: 'const value = 1;\n',
      extensions: prismPadExtensions({ language: 'javascript', dark: true })
    });

    expect(state.facet(EditorState.allowMultipleSelections)).toBe(true);
    expect(document.querySelector('.cm-tooltip-autocomplete')).toBeNull();
  });

  it('loads a language without registering a completion source', async () => {
    const language = await loadLanguage('shell');
    const state = EditorState.create({ doc: 'echo PrismPad\n', extensions: [language] });

    expect(state.languageDataAt('autocomplete', 0)).toEqual([]);
  });

  it('wraps a selected range and keeps the selection inside the pair', () => {
    const view = new EditorView({
      parent: document.createElement('div'),
      state: EditorState.create({
        doc: 'alpha',
        selection: { anchor: 1, head: 4 },
        extensions: prismPadExtensions({ language: 'plain', dark: false })
      })
    });

    view.state.facet(keymap).flat().find((binding) => binding.key === '(')?.run?.(view);

    expect(view.state.doc.toString()).toBe('a(lph)a');
    expect(view.state.selection.main).toMatchObject({ anchor: 2, head: 5 });
    view.destroy();
  });

  it('wraps every selected range and preserves all selections', () => {
    const view = new EditorView({
      parent: document.createElement('div'),
      state: EditorState.create({
        doc: 'one two',
        selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)]),
        extensions: prismPadExtensions({ language: 'plain', dark: false })
      })
    });

    view.state.facet(keymap).flat().find((binding) => binding.key === '(')?.run?.(view);

    expect(view.state.doc.toString()).toBe('(one) (two)');
    expect(view.state.selection.ranges).toMatchObject([{ anchor: 1, head: 4 }, { anchor: 7, head: 10 }]);
    view.destroy();
  });

  it('inserts around an empty cursor and skips an existing closing delimiter', () => {
    const view = new EditorView({
      parent: document.createElement('div'),
      state: EditorState.create({
        doc: 'text',
        selection: { anchor: 2 },
        extensions: prismPadExtensions({ language: 'plain', dark: false })
      })
    });

    view.state.facet(keymap).flat().find((binding) => binding.key === '(')?.run?.(view);
    expect(view.state.doc.toString()).toBe('te()xt');
    expect(view.state.selection.main.anchor).toBe(3);

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '()' }, selection: { anchor: 1 } });
    view.state.facet(keymap).flat().find((binding) => binding.key === ')')?.run?.(view);
    expect(view.state.doc.toString()).toBe('()');
    expect(view.state.selection.main.anchor).toBe(2);
    view.destroy();
  });
});
