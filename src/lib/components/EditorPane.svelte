<script lang="ts">
  import { onMount } from 'svelte';
  import { createPrismEditor, type PrismEditor } from '../editor/create-editor';
  import type { DocumentRecord } from '../domain/document';

  type Props = {
    document: DocumentRecord;
    dark: boolean;
    onTextChange: (id: string, text: string) => void;
    onCursorChange: (id: string, anchor: number, head: number) => void;
    onNotice: (message: string) => void;
    onReady?: (editor: PrismEditor) => void;
  };

  let { document: record, dark, onTextChange, onCursorChange, onNotice, onReady }: Props = $props();
  let host: HTMLDivElement;
  let editor: PrismEditor | null = null;

  onMount(() => {
    editor = createPrismEditor({
      parent: host,
      document: record,
      dark,
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
      editor.configure({ dark });
    }
  });
</script>

<div class="editor-pane" aria-label="Editor">
  <div class="editor-host" bind:this={host}></div>
</div>
