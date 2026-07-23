<script lang="ts">
  import { onMount } from 'svelte';
  import type { CloseDecision } from '../controllers/window-lifecycle';

  type DirtyDocument = Readonly<{ id: string; title: string }>;

  let {
    documents,
    onResolve
  }: {
    documents: readonly DirtyDocument[];
    onResolve: (decisions: readonly CloseDecision[]) => void;
  } = $props();

  let decisions = $state<Record<string, 'save' | 'discard'>>({});
  let dialog: HTMLDialogElement;
  let cancelButton: HTMLButtonElement;

  $effect(() => {
    decisions = Object.fromEntries(documents.map((document) => [document.id, 'save']));
  });

  const submit = (): void => onResolve(documents.map((document) => ({
    id: document.id,
    action: decisions[document.id] ?? 'save'
  })));

  const cancel = (): void => onResolve(documents.map((document) => ({ id: document.id, action: 'cancel' })));

  onMount(() => {
    const fallbackBackground = Array.from(dialog.parentElement?.children ?? [])
      .filter((element) => element !== dialog)
      .map((element) => ({
        element: element as HTMLElement,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: (element as HTMLElement & { inert?: boolean }).inert ?? false
      }));
    const showModal = typeof dialog.showModal === 'function';
    if (showModal) {
      dialog.showModal();
    } else {
      dialog.open = true;
      for (const background of fallbackBackground) {
        (background.element as HTMLElement & { inert: boolean }).inert = true;
        background.element.setAttribute('aria-hidden', 'true');
      }
    }
    cancelButton.focus();

    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
      for (const background of fallbackBackground) {
        (background.element as HTMLElement & { inert: boolean }).inert = background.inert;
        if (background.ariaHidden === null) {
          background.element.removeAttribute('aria-hidden');
        } else {
          background.element.setAttribute('aria-hidden', background.ariaHidden);
        }
      }
    };
  });
</script>

<dialog bind:this={dialog} class="unsaved-dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title" oncancel={(event) => {
  event.preventDefault();
  cancel();
}}>
  <h2 id="unsaved-dialog-title">Unsaved changes</h2>
  <p>Choose what to do with each modified document before closing PrismPad.</p>
  <ul>
    {#each documents as document (document.id)}
      <li>
        <span>{document.title}</span>
        <label>
          <span class="visually-hidden">{document.title} decision</span>
          <select aria-label={`${document.title} decision`} bind:value={decisions[document.id]}>
            <option value="save">Save</option>
            <option value="discard">Discard</option>
          </select>
        </label>
      </li>
    {/each}
  </ul>
  <div class="dialog-actions">
    <button bind:this={cancelButton} type="button" onclick={cancel}>Cancel</button>
    <button type="button" onclick={submit}>Continue</button>
  </div>
</dialog>
