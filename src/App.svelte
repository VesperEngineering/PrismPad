<script lang="ts">
  import TabStrip from './lib/components/TabStrip.svelte';
  import WelcomeView from './lib/components/WelcomeView.svelte';
  import EditorPane from './lib/components/EditorPane.svelte';
  import FindPanel from './lib/components/FindPanel.svelte';
  import type { PrismEditor } from './lib/editor/create-editor';
  import { LANGUAGES } from './lib/domain/languages';
  import type { DocumentSnapshot } from './lib/domain/document';
  import { createDocumentStore } from './lib/stores/documents.svelte';

  const appName = 'PrismPad';
  const documentStore = createDocumentStore();

  let snapshot = $state<DocumentSnapshot>(documentStore.snapshot());
  let theme = $state<'light' | 'dark'>('light');
  let editor = $state<PrismEditor | null>(null);
  let notice = $state<string | null>(null);

  const activeDocument = $derived(
    snapshot.documents.find((document) => document.id === snapshot.activeId) ?? null
  );
  const activeLanguage = $derived(
    activeDocument ? LANGUAGES.find((language) => language.id === activeDocument.language) : null
  );
  const cursor = $derived.by(() => {
    if (!activeDocument) {
      return null;
    }
    const preceding = activeDocument.text.slice(0, activeDocument.head);
    return {
      line: preceding.split('\n').length,
      column: preceding.length - preceding.lastIndexOf('\n')
    };
  });

  const refreshDocuments = (): void => {
    snapshot = documentStore.snapshot();
  };

  const createDocument = (language: typeof LANGUAGES[number]['id']): void => {
    documentStore.createUntitled(language);
    refreshDocuments();
  };

  const openExisting = (): void => {
    // Native file dialog integration is introduced with the file-service task.
  };

  const toggleTheme = (): void => {
    theme = theme === 'light' ? 'dark' : 'light';
  };
</script>

<main class="app-shell" role="application" aria-label={appName} data-theme={theme}>
  <header class="menu-bar">
    <div class="app-identity" aria-label="PrismPad">PrismPad</div>
    <nav class="app-menu" aria-label="Application menu">
      <button type="button">File</button>
      <button type="button">Edit</button>
      <button type="button">View</button>
    </nav>
    <button class="theme-toggle" type="button" aria-pressed={theme === 'dark'} onclick={toggleTheme}>
      {theme === 'dark' ? 'Light theme' : 'Dark theme'}
    </button>
  </header>

  {#if snapshot.documents.length > 0}
    <TabStrip
      documents={snapshot.documents}
      activeId={snapshot.activeId}
      onActivate={(id) => {
        documentStore.activate(id);
        refreshDocuments();
      }}
      onClose={(id) => {
        documentStore.remove(id);
        refreshDocuments();
      }}
      onReorder={(sourceId, targetId) => {
        documentStore.reorder(sourceId, targetId);
        refreshDocuments();
      }}
    />
  {:else}
    <div class="tab-strip empty-tab-strip" aria-hidden="true"></div>
  {/if}

  <section class="workspace" aria-live="polite">
    {#if snapshot.documents.length === 0}
      <WelcomeView onSelect={createDocument} onOpenExisting={openExisting} />
    {:else if activeDocument}
      <div
        class="document-canvas"
        id={`document-${activeDocument.id}`}
        aria-labelledby={`tab-${activeDocument.id}`}
      >
        <EditorPane
          document={activeDocument}
          dark={theme === 'dark'}
          onTextChange={(id, text) => {
            documentStore.applyEdit(id, text);
            refreshDocuments();
          }}
          onCursorChange={(id, anchor, head) => {
            documentStore.setSelection(id, anchor, head);
            refreshDocuments();
          }}
          onNotice={(message) => (notice = message)}
          onReady={(nextEditor) => (editor = nextEditor)}
        />
        <FindPanel {editor} />
        {#if notice}
          <p class="editor-notice" role="status">{notice}</p>
        {/if}
      </div>
    {/if}
  </section>

  <footer class="status-bar" aria-label="Document status">
    <span>{activeLanguage?.label ?? 'Welcome'}</span>
    <span>{cursor ? `Ln ${cursor.line}, Col ${cursor.column}` : 'No cursor'}</span>
    <span>{activeDocument?.encoding.toUpperCase() ?? 'Local only'}</span>
    <span>{activeDocument?.lineEnding.toUpperCase() ?? 'No document open'}</span>
  </footer>
</main>
