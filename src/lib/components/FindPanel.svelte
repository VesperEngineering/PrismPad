<script lang="ts">
  import { SearchQuery, findNext, findPrevious, replaceAll, replaceNext, setSearchQuery } from '@codemirror/search';
  import type { PrismEditor } from '../editor/create-editor';

  type Props = { editor: PrismEditor | null };

  let { editor }: Props = $props();
  let search = $state('');
  let replace = $state('');

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

<form class="find-panel" aria-label="Find and replace" onsubmit={(event) => { event.preventDefault(); run(findNext); }}>
  <label>
    Find
    <input bind:value={search} type="search" />
  </label>
  <label>
    Replace
    <input bind:value={replace} type="text" />
  </label>
  <div class="find-actions">
    <button type="submit">Next</button>
    <button type="button" onclick={() => run(findPrevious)}>Previous</button>
    <button type="button" onclick={() => run(replaceNext)}>Replace</button>
    <button type="button" onclick={() => run(replaceAll)}>Replace all</button>
  </div>
</form>
