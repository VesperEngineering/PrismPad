<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { MergeView } from '@codemirror/merge';
  import { EditorView } from '@codemirror/view';

  type Props = { diskText: string; editorText: string; onClose: () => void; };
  let { diskText, editorText, onClose }: Props = $props();
  let host: HTMLDivElement;
  let dialog: HTMLDialogElement;

  const trapFocus = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last || event.shiftKey && document.activeElement === dialog || document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  onMount(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallbackBackground = Array.from(dialog.parentElement?.children ?? []).filter((element) => element !== dialog)
      .map((element) => ({ element: element as HTMLElement, ariaHidden: element.getAttribute('aria-hidden'), inert: (element as HTMLElement & { inert?: boolean }).inert ?? false }));
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
      dialog.open = true;
      for (const background of fallbackBackground) {
        (background.element as HTMLElement & { inert: boolean }).inert = true;
        background.element.setAttribute('aria-hidden', 'true');
      }
    }
    dialog.focus();
    const readOnly = [EditorState.readOnly.of(true), EditorView.editable.of(false)];
    const merge = new MergeView({ a: { doc: diskText, extensions: readOnly }, b: { doc: editorText, extensions: readOnly }, orientation: 'a-b', parent: host });
    return () => {
      merge.destroy();
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      for (const background of fallbackBackground) {
        (background.element as HTMLElement & { inert: boolean }).inert = background.inert;
        if (background.ariaHidden === null) background.element.removeAttribute('aria-hidden');
        else background.element.setAttribute('aria-hidden', background.ariaHidden);
      }
      returnFocus?.focus();
    };
  });
</script>

<dialog bind:this={dialog} class="diff-dialog" aria-modal="true" aria-label="Compare external change" tabindex="-1" onkeydown={trapFocus} oncancel={(event) => { event.preventDefault(); onClose(); }}>
  <header><h2>Compare external change</h2><button type="button" aria-label="Close comparison" onclick={onClose}>Close</button></header>
  <div class="diff-labels" aria-hidden="true"><span>Disk version</span><span>Editor version</span></div>
  <div bind:this={host} class="diff-host" aria-label="Read-only comparison"></div>
</dialog>
