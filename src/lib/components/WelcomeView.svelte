<script lang="ts">
  import { LANGUAGES, type LanguageId } from '../domain/languages';

  type Props = {
    onSelect: (id: LanguageId) => void;
    onOpenExisting: () => void;
  };

  let { onSelect, onOpenExisting }: Props = $props();
  let query = $state('');

  const filteredLanguages = $derived(
    LANGUAGES.filter((language) => language.label.toLowerCase().includes(query.trim().toLowerCase()))
  );
</script>

<section aria-label="Choose a language">
  <h1>Hello! What will you code in today?</h1>

  <label for="language-search">Search languages</label>
  <input id="language-search" type="search" bind:value={query} />

  <div aria-label="Languages">
    {#each filteredLanguages as language}
      <button type="button" onclick={() => onSelect(language.id)}>{language.label}</button>
    {/each}
  </div>

  <button type="button" onclick={onOpenExisting}>Open existing file</button>
</section>
