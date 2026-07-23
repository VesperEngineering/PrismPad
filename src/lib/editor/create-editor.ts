import { EditorState, Transaction, type Extension, type StateEffect } from '@codemirror/state';
import { EditorView, highlightWhitespace } from '@codemirror/view';
import type { DocumentRecord } from '../domain/document';
import type { LanguageId } from '../domain/languages';
import {
  editorIndentation,
  editorIndentationGuides,
  createIndentationGuides,
  editorAppearance,
  editorLanguage,
  editorTheme,
  editorWhitespace,
  editorWrapping,
  loadLanguage,
  prismPadExtensions,
  type EditorExtensionOptions
} from './extensions';
import { prismPadTheme } from './themes';
import { indentUnit } from '@codemirror/language';

export type PrismEditorOptions = Readonly<{
  parent: HTMLElement;
  document: DocumentRecord;
  dark: boolean;
  wrap?: boolean;
  tabSize?: number;
  indentWithTabs?: boolean;
    showWhitespace?: boolean;
  showIndentationGuides?: boolean;
  fontSize?: number;
  onTextChange: (id: string, text: string) => void;
  onCursorChange: (id: string, anchor: number, head: number) => void;
  onNotice: (message: string) => void;
}>;

export type PrismEditor = Readonly<{
  replaceDocument(record: DocumentRecord): void;
  configure(options: Partial<Omit<EditorExtensionOptions, 'language'>>): void;
  focus(): void;
  getView(): EditorView;
  destroy(): void;
}>;

type EditorSettings = Required<Omit<EditorExtensionOptions, 'language'>>;

const failureNotice = 'Syntax highlighting could not be loaded; using Plain Text.';

const clampSelection = (record: DocumentRecord): { anchor: number; head: number } => {
  const length = record.text.length;
  return {
    anchor: Math.min(Math.max(record.anchor, 0), length),
    head: Math.min(Math.max(record.head, 0), length)
  };
};

type DocumentEcho = Readonly<{ text: string; anchor: number; head: number }>;

export const createPrismEditor = (options: PrismEditorOptions): PrismEditor => {
  let settings: EditorSettings = {
    dark: options.dark,
    wrap: options.wrap ?? true,
    tabSize: options.tabSize ?? 2,
    indentWithTabs: options.indentWithTabs ?? false,
    showWhitespace: options.showWhitespace ?? false
    ,showIndentationGuides: options.showIndentationGuides ?? true
    ,fontSize: options.fontSize ?? 14
  };
  let activeId = options.document.id;
  let destroyed = false;
  let languageFailureNotified = false;
  const states = new Map<string, EditorState>();
  const languages = new Map<string, LanguageId>();
  const loadedLanguages = new Map<LanguageId, Extension>();
  const expectedEchoes = new Map<string, DocumentEcho>();
  const latestRecords = new Map<string, DocumentEcho>();

  const recordSnapshot = (record: DocumentRecord): DocumentEcho => ({
    text: record.text,
    anchor: record.anchor,
    head: record.head
  });

  const matchingSnapshot = (left: DocumentEcho, right: DocumentEcho): boolean =>
    left.text === right.text && left.anchor === right.anchor && left.head === right.head;

  const reconfigurationEffects = (): StateEffect<unknown>[] => [
    editorTheme.reconfigure(prismPadTheme(settings.dark)),
    editorWrapping.reconfigure(settings.wrap ? EditorView.lineWrapping : []),
    editorIndentation.reconfigure([
      EditorState.tabSize.of(settings.tabSize),
      indentUnit.of(settings.indentWithTabs ? '\t' : ' '.repeat(settings.tabSize))
    ]),
    editorWhitespace.reconfigure(settings.showWhitespace ? highlightWhitespace() ?? [] : []),
    editorIndentationGuides.reconfigure(settings.showIndentationGuides ? createIndentationGuides() : [])
    ,editorAppearance.reconfigure(EditorView.theme({ '&': { fontSize: `${settings.fontSize}px` } }))
  ];

  const updateState = (state: EditorState, effects: StateEffect<unknown>[]): EditorState =>
    state.update({ effects }).state;

  const synchronizeState = (state: EditorState, record: DocumentRecord): EditorState => {
    const selection = clampSelection(record);
    const currentSelection = state.selection.main;
    const textChanged = state.doc.toString() !== record.text;
    const selectionChanged =
      currentSelection.anchor !== selection.anchor || currentSelection.head !== selection.head;

    if (!textChanged && !selectionChanged) {
      return state;
    }

    return state.update({
      changes: textChanged ? { from: 0, to: state.doc.length, insert: record.text } : undefined,
      selection,
      annotations: Transaction.addToHistory.of(false)
    }).state;
  };

  const stateForRecord = (record: DocumentRecord): EditorState => {
    const existing = states.get(record.id);
    if (!existing) {
      return stateFor(record);
    }

    const incoming = recordSnapshot(record);
    const expected = expectedEchoes.get(record.id);
    const previous = latestRecords.get(record.id);
    if (expected && matchingSnapshot(expected, incoming)) {
      expectedEchoes.delete(record.id);
      latestRecords.set(record.id, incoming);
      return existing;
    }

    if (expected && previous && matchingSnapshot(previous, incoming)) {
      return existing;
    }

    expectedEchoes.delete(record.id);
    const next = synchronizeState(existing, record);
    states.set(record.id, next);
    latestRecords.set(record.id, incoming);
    return next;
  };

  const stateFor = (record: DocumentRecord): EditorState => {
    languages.set(record.id, record.language);
    latestRecords.set(record.id, recordSnapshot(record));
    const state = EditorState.create({
      doc: record.text,
      selection: clampSelection(record),
      extensions: [
        prismPadExtensions({ ...settings, language: record.language }),
        EditorView.updateListener.of((update) => {
          if (activeId === record.id) {
            states.set(record.id, update.state);
          }
          if (update.docChanged || update.selectionSet) {
            const selection = update.state.selection.main;
            expectedEchoes.set(record.id, {
              text: update.state.doc.toString(),
              anchor: selection.anchor,
              head: selection.head
            });
          }
          if (update.docChanged) {
            options.onTextChange(record.id, update.state.doc.toString());
          }
          if (update.selectionSet) {
            const selection = update.state.selection.main;
            options.onCursorChange(record.id, selection.anchor, selection.head);
          }
        })
      ]
    });
    states.set(record.id, state);
    return state;
  };

  const initialState = stateFor(options.document);
  const view = new EditorView({ state: initialState, parent: options.parent });

  const applyLanguage = (id: string, extension: Extension): void => {
    const state = states.get(id);
    if (!state || destroyed) {
      return;
    }
    const next = updateState(state, [editorLanguage.reconfigure(extension)]);
    states.set(id, next);
    if (activeId === id) {
      view.setState(next);
    }
  };

  const loadDocumentLanguage = (id: string, language: LanguageId): void => {
    if (language === 'plain') {
      applyLanguage(id, []);
      return;
    }
    const cached = loadedLanguages.get(language);
    if (cached) {
      applyLanguage(id, cached);
      return;
    }
    void loadLanguage(language)
      .then((extension) => {
        loadedLanguages.set(language, extension);
        if (languages.get(id) === language) {
          applyLanguage(id, extension);
        }
      })
      .catch(() => {
        if (destroyed || languages.get(id) !== language) {
          return;
        }
        applyLanguage(id, []);
        if (!languageFailureNotified) {
          languageFailureNotified = true;
          options.onNotice(failureNotice);
        }
      });
  };

  loadDocumentLanguage(options.document.id, options.document.language);

  return {
    replaceDocument: (record: DocumentRecord): void => {
      if (destroyed) {
        return;
      }
      const previousLanguage = languages.get(record.id);
      languages.set(record.id, record.language);
      const next = stateForRecord(record);
      if (activeId === record.id) {
        if (next !== view.state) {
          view.setState(next);
        }
        if (previousLanguage !== record.language) {
          loadDocumentLanguage(record.id, record.language);
        }
        return;
      }
      activeId = record.id;
      view.setState(next);
      loadDocumentLanguage(record.id, record.language);
    },
    configure: (nextOptions): void => {
      if (destroyed) {
        return;
      }
      settings = { ...settings, ...nextOptions };
      for (const [id, state] of states) {
        const next = updateState(state, reconfigurationEffects());
        states.set(id, next);
        if (id === activeId) {
          view.setState(next);
        }
      }
    },
    focus: (): void => view.focus(),
    getView: (): EditorView => view,
    destroy: (): void => {
      destroyed = true;
      states.clear();
      expectedEchoes.clear();
      latestRecords.clear();
      view.destroy();
    }
  };
};
