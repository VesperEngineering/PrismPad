<script lang="ts">
  import { tick } from 'svelte';
  import { SearchQuery, findNext, findPrevious, replaceAll, replaceNext, setSearchQuery } from '@codemirror/search';
  import type { PrismEditor } from '../editor/create-editor';

  type Props = { editor: PrismEditor | null; mode?: 'find' | 'replace' | null; onClose?: () => void };

  let { editor, mode = null, onClose = () => undefined }: Props = $props();
  let search = $state('');
  let replace = $state('');
  let input = $state<HTMLInputElement | null>(null);

  $effect(() => { if (mode) void tick().then(() => input?.focus()); });

  const run = (command: (view: ReturnType<PrismEditor['getView']>) => boolean): void => {
    const view = editor?.getView();
    if (!view || !search) {
      return;
    }
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search, replace })) });
    command(view);
    view.focus();
  };
</script>

{#if mode}
<form class="find-panel" aria-label={mode === 'replace' ? 'Replace' : 'Find'} onsubmit={(event) => { event.preventDefault(); run(findNext); }}>
  <label>
    Find
    <input bind:this={input} bind:value={search} type="search" aria-label="Find text" onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); editor?.focus(); } }} />
  </label>
  {#if mode === 'replace'}
  <label>
    Replace
    <input bind:value={replace} type="text" aria-label="Replace text" onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); editor?.focus(); } }} />
  </label>
  {/if}
  <div class="find-actions">
    <button type="submit">Next</button>
    <button type="button" onclick={() => run(findPrevious)}>Previous</button>
    {#if mode === 'replace'}
      <button type="button" onclick={() => run(replaceNext)}>Replace</button>
      <button type="button" onclick={() => run(replaceAll)}>Replace all</button>
    {/if}
    <button type="button" aria-label="Close find" onclick={() => { onClose(); editor?.focus(); }}>Close</button>
  </div>
</form>
{/if}
