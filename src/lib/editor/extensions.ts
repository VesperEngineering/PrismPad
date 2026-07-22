import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  indentUnit,
  StreamLanguage,
  type StreamParser
} from '@codemirror/language';
import { Compartment, EditorSelection, EditorState, type ChangeSpec, type Extension } from '@codemirror/state';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  highlightTrailingWhitespace,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view';
import type { Command, KeyBinding } from '@codemirror/view';
import type { LanguageId } from '../domain/languages';
import { prismPadTheme } from './themes';

export const editorLanguage = new Compartment();
export const editorTheme = new Compartment();
export const editorWrapping = new Compartment();
export const editorIndentation = new Compartment();
export const editorWhitespace = new Compartment();

export type EditorExtensionOptions = Readonly<{
  language: LanguageId;
  dark: boolean;
  wrap?: boolean;
  tabSize?: number;
  indentWithTabs?: boolean;
  showWhitespace?: boolean;
}>;

const streamLanguageWithoutCompletionData = (parser: StreamParser<unknown>): Extension => {
  const { autocomplete: _completion, ...languageData } = parser.languageData ?? {};
  return StreamLanguage.define({ ...parser, languageData });
};

export const loadLanguage = async (id: LanguageId): Promise<Extension> => {
  switch (id) {
    case 'python': return (await import('@codemirror/lang-python')).pythonLanguage;
    case 'markdown': return (await import('@codemirror/lang-markdown')).markdownLanguage;
    case 'yaml': return (await import('@codemirror/lang-yaml')).yamlLanguage;
    case 'json': return (await import('@codemirror/lang-json')).jsonLanguage;
    case 'javascript': return (await import('@codemirror/lang-javascript')).javascriptLanguage;
    case 'typescript': return (await import('@codemirror/lang-javascript')).typescriptLanguage;
    case 'jsx': return (await import('@codemirror/lang-javascript')).jsxLanguage;
    case 'tsx': return (await import('@codemirror/lang-javascript')).tsxLanguage;
    case 'html': return (await import('@codemirror/lang-html')).htmlLanguage;
    case 'css': return (await import('@codemirror/lang-css')).cssLanguage;
    case 'rust': return (await import('@codemirror/lang-rust')).rustLanguage;
    case 'c':
    case 'cpp': return (await import('@codemirror/lang-cpp')).cppLanguage;
    case 'java': return (await import('@codemirror/lang-java')).javaLanguage;
    case 'sql': return (await import('@codemirror/lang-sql')).StandardSQL.language;
    case 'xml': return (await import('@codemirror/lang-xml')).xmlLanguage;
    case 'shell': {
      const { shell } = await import('@codemirror/legacy-modes/mode/shell');
      return streamLanguageWithoutCompletionData(shell);
    }
    case 'powershell': {
      const { powerShell } = await import('@codemirror/legacy-modes/mode/powershell');
      return streamLanguageWithoutCompletionData(powerShell);
    }
    case 'toml': {
      const { toml } = await import('@codemirror/legacy-modes/mode/toml');
      return streamLanguageWithoutCompletionData(toml);
    }
    case 'plain': return [];
  }
};

const closingPairs: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`'
};

const closePair = (open: string, close: string): Command => (view) => {
  const selections = view.state.selection.ranges;
  if (
    open === close &&
    selections.every((range) => range.empty && view.state.doc.sliceString(range.to, range.to + 1) === close)
  ) {
    view.dispatch({
      selection: EditorSelection.create(
        selections.map((range) => EditorSelection.cursor(range.from + 1)),
        view.state.selection.mainIndex
      )
    });
    return true;
  }
  const changes: ChangeSpec[] = [];
  let insertedCharacters = 0;
  const nextSelections = selections.map((range) => {
    const nextFrom = range.from + insertedCharacters;
    if (range.empty) {
      changes.push({ from: range.from, to: range.to, insert: `${open}${close}` });
      insertedCharacters += 2;
      return EditorSelection.cursor(nextFrom + 1);
    }

    const selectedText = view.state.doc.sliceString(range.from, range.to);
    changes.push({ from: range.from, to: range.to, insert: `${open}${selectedText}${close}` });
    insertedCharacters += 2;
    return EditorSelection.range(nextFrom + 1, nextFrom + 1 + selectedText.length);
  });
  view.dispatch({
    changes,
    selection: EditorSelection.create(nextSelections, view.state.selection.mainIndex)
  });
  return true;
};

const skipClosingPair = (close: string): Command => (view) => {
  const selections = view.state.selection.ranges;
  if (!selections.every((range) => range.empty && view.state.doc.sliceString(range.to, range.to + 1) === close)) {
    return false;
  }
  view.dispatch({
    selection: EditorSelection.create(
      selections.map((range) => EditorSelection.cursor(range.from + 1)),
      view.state.selection.mainIndex
    )
  });
  return true;
};

const closingPairKeymap: readonly KeyBinding[] = Object.entries(closingPairs).flatMap(([open, close]) => {
  const opening: KeyBinding = { key: open, run: closePair(open, close) };
  return open === close ? [opening] : [opening, { key: close, run: skipClosingPair(close) }];
});

const indentationExtension = (tabSize: number, useTabs: boolean): Extension => [
  EditorState.tabSize.of(tabSize),
  indentUnit.of(useTabs ? '\t' : ' '.repeat(tabSize))
];

export const prismPadExtensions = (options: EditorExtensionOptions): Extension[] => [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  indentOnInput(),
  bracketMatching(),
  EditorState.allowMultipleSelections.of(true),
  keymap.of([...closingPairKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
  editorLanguage.of([]),
  editorTheme.of(prismPadTheme(options.dark)),
  editorWrapping.of(options.wrap === false ? [] : EditorView.lineWrapping),
  editorIndentation.of(indentationExtension(options.tabSize ?? 2, options.indentWithTabs ?? false)),
  editorWhitespace.of(options.showWhitespace ? highlightTrailingWhitespace() : [])
];
