<script lang="ts">
  import { onMount } from 'svelte';
  import { createPrismEditor, type PrismEditor } from '../editor/create-editor';
  import type { DocumentRecord } from '../domain/document';

  type Props = {
    document: DocumentRecord;
    dark: boolean;
    preferences?: Readonly<{ fontSize: number; wordWrap: boolean; tabWidth: 2 | 4 | 8; indentStyle: 'spaces' | 'tabs'; indentationGuides: boolean; visibleWhitespace: boolean }>;
    onTextChange: (id: string, text: string) => void;
    onCursorChange: (id: string, anchor: number, head: number) => void;
    onNotice: (message: string) => void;
    onReady?: (editor: PrismEditor) => void;
  };

  let { document: record, dark, preferences, onTextChange, onCursorChange, onNotice, onReady }: Props = $props();
  let host: HTMLDivElement;
  let editor: PrismEditor | null = null;
  const editorPreferences = (): Record<string, boolean | number> => preferences
    ? {
        fontSize: preferences.fontSize,
        wrap: preferences.wordWrap,
        tabSize: preferences.tabWidth,
        indentWithTabs: preferences.indentStyle === 'tabs',
        showIndentationGuides: preferences.indentationGuides,
        showWhitespace: preferences.visibleWhitespace
      }
    : {};

  onMount(() => {
    editor = createPrismEditor({
      parent: host,
      document: record,
      dark,
      ...editorPreferences(),
      onTextChange,
      onCursorChange,
      onNotice
    });
    onReady?.(editor);
    return () => editor?.destroy();
  });

  $effect(() => {
    if (editor) {
      editor.replaceDocument(record);
      editor.configure({ dark, ...editorPreferences() });
    }
  });
</script>

<div class="editor-pane" aria-label="Editor">
  <div class="editor-host" bind:this={host}></div>
</div>
