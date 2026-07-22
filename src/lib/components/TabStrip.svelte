<script lang="ts">
  type TabDocument = Readonly<{
    id: string;
    title: string;
    dirty: boolean;
  }>;

  type Props = {
    documents: readonly TabDocument[];
    activeId: string | null;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onReorder: (sourceId: string, targetId: string) => void;
  };

  let { documents, activeId, onActivate, onClose, onReorder }: Props = $props();
  let dragSourceId: string | null = $state(null);
  let tabs: HTMLButtonElement[] = $state([]);

  const isDocumentId = (id: string | null): id is string =>
    id !== null && documents.some((document) => document.id === id);

  const moveFocus = (event: KeyboardEvent, index: number, offset: number): void => {
    event.preventDefault();
    const nextIndex = (index + offset + documents.length) % documents.length;
    const next = documents[nextIndex];
    onActivate(next.id);
    tabs[nextIndex]?.focus();
  };

  const handleKeydown = (event: KeyboardEvent, index: number): void => {
    if (documents.length < 2) {
      return;
    }

    if (event.key === 'ArrowRight') {
      moveFocus(event, index, 1);
    } else if (event.key === 'ArrowLeft') {
      moveFocus(event, index, -1);
    } else if (event.key === 'Home') {
      moveFocus(event, index, -index);
    } else if (event.key === 'End') {
      moveFocus(event, index, documents.length - 1 - index);
    }
  };

  const handleDrop = (targetId: string): void => {
    if (isDocumentId(dragSourceId) && isDocumentId(targetId) && dragSourceId !== targetId) {
      onReorder(dragSourceId, targetId);
    }
    dragSourceId = null;
  };
</script>

<div class="tab-strip" role="tablist" aria-label="Open documents">
  {#each documents as document, index (document.id)}
    <div class="tab-entry" class:is-dirty={document.dirty}>
      <button
        bind:this={tabs[index]}
        class="document-tab"
        class:is-dirty={document.dirty}
        data-testid={`tab-${document.id}`}
        id={`tab-${document.id}`}
        type="button"
        role="tab"
        aria-selected={activeId === document.id}
        aria-controls={`document-${document.id}`}
        tabindex={activeId === document.id ? 0 : -1}
        draggable="true"
        onclick={() => onActivate(document.id)}
        onkeydown={(event) => handleKeydown(event, index)}
        ondragstart={() => (dragSourceId = document.id)}
        ondragend={() => (dragSourceId = null)}
        ondragover={(event) => event.preventDefault()}
        ondrop={() => handleDrop(document.id)}
      >
        <span class="tab-title">{document.title}</span>
        {#if document.dirty}
          <span class="dirty-dot" aria-label="Unsaved changes"></span>
        {/if}
      </button>
      <button class="tab-close" type="button" aria-label={`Close ${document.title}`} onclick={() => onClose(document.id)}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  {/each}
</div>
