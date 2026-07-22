import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const prismPadHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.definitionKeyword], color: 'var(--syntax-keyword)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--syntax-string)' },
  { tag: [tags.function(tags.variableName), tags.labelName, tags.heading], color: 'var(--syntax-function)' },
  { tag: [tags.comment, tags.meta], color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-keyword)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--syntax-function)' }
]);

export const prismPadTheme = (dark: boolean): Extension => [
  EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--text)',
        backgroundColor: 'var(--surface)'
      },
      '.cm-content, .cm-gutter': { fontFamily: "'JetBrains Mono Variable', monospace" },
      '.cm-content': { caretColor: 'var(--accent)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
      '.cm-gutters': {
        color: 'var(--muted)',
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border)'
      },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 9%, transparent)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 32%, transparent) !important'
      },
      '.cm-matchingBracket': { outline: '1px solid var(--accent)' },
      '.cm-foldGutter .cm-gutterElement': { color: 'var(--muted)' }
    },
    { dark }
  ),
  syntaxHighlighting(prismPadHighlightStyle)
];
