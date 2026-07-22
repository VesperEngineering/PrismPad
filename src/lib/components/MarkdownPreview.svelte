<script lang="ts">
  import { renderMarkdown } from '../markdown/render-markdown';

  type Props = {
    source: string;
  };

  let { source }: Props = $props();

  const preview = $derived.by(() => {
    try {
      return { html: renderMarkdown(source), failed: false };
    } catch {
      return { html: '', failed: true };
    }
  });
</script>

<section class="markdown-preview" aria-label="Markdown preview">
  {#if preview.failed}
    <p class="markdown-preview-error" role="status">Markdown preview is temporarily unavailable.</p>
  {:else}
    {@html preview.html}
  {/if}
</section>
