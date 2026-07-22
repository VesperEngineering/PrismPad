<script lang="ts">
  import { onMount } from 'svelte';
  import type { ExternalChangePrompt } from '../controllers/external-changes';

  type Props = {
    change: ExternalChangePrompt;
    onReload: () => void;
    onCompare: () => void;
    onKeep: () => void;
    onDismiss: () => void;
    busy?: boolean;
  };

  let { change, onReload, onCompare, onKeep, onDismiss, busy = false }: Props = $props();
  let dialog: HTMLDialogElement;

  const trapFocus = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy) {
        onDismiss();
      }
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  onMount(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallbackBackground = Array.from(dialog.parentElement?.children ?? []).filter((element) => element !== dialog)
      .map((element) => ({ element: element as HTMLElement, ariaHidden: element.getAttribute('aria-hidden'), inert: (element as HTMLElement & { inert?: boolean }).inert ?? false }));
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.open = true;
      for (const background of fallbackBackground) {
        (background.element as HTMLElement & { inert: boolean }).inert = true;
        background.element.setAttribute('aria-hidden', 'true');
      }
    }
    dialog.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
      for (const background of fallbackBackground) {
        (background.element as HTMLElement & { inert: boolean }).inert = background.inert;
        if (background.ariaHidden === null) background.element.removeAttribute('aria-hidden');
        else background.element.setAttribute('aria-hidden', background.ariaHidden);
      }
      returnFocus?.focus();
    };
  });
</script>

<dialog bind:this={dialog} class="external-change-dialog" aria-modal="true" aria-labelledby="external-change-title" tabindex="-1" onkeydown={trapFocus} oncancel={(event) => { event.preventDefault(); if (!busy) onDismiss(); }}>
  <h2 id="external-change-title">File changed outside PrismPad</h2>
  <p><code>{change.path}</code> has changed on disk.</p>
  <p>Reload replaces the editor contents. Compare and Keep Editor Version preserve your current edits.</p>
  <div class="dialog-actions">
    <button type="button" disabled={busy} onclick={onReload}>Reload From Disk</button>
    <button type="button" disabled={busy} onclick={onCompare}>Compare</button>
    <button type="button" disabled={busy} onclick={onKeep}>Keep Editor Version</button>
  </div>
</dialog>
