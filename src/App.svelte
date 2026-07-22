<script lang="ts">
  import { onMount } from 'svelte';
  import TabStrip from './lib/components/TabStrip.svelte';
  import WelcomeView from './lib/components/WelcomeView.svelte';
  import EditorPane from './lib/components/EditorPane.svelte';
  import FindPanel from './lib/components/FindPanel.svelte';
  import type { PrismEditor } from './lib/editor/create-editor';
  import { LANGUAGES } from './lib/domain/languages';
  import type { DocumentSnapshot } from './lib/domain/document';
  import { createDocumentActions } from './lib/controllers/document-actions';
  import {
    chooseOpenPaths,
    chooseSavePath,
    confirmLargeFile,
    openFile,
    saveFile,
    subscribeToFileDrops
  } from './lib/native/file-api';
  import { createDocumentStore } from './lib/stores/documents.svelte';

  const appName = 'PrismPad';
  const documentStore = createDocumentStore();

  let snapshot = $state<DocumentSnapshot>(documentStore.snapshot());
  let theme = $state<'light' | 'dark'>('light');
  let editor = $state<PrismEditor | null>(null);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let fileMenuOpen = $state(false);
  let appRoot: HTMLElement;

  const actions = createDocumentActions({
    documents: documentStore,
    chooseOpenPaths,
    chooseSavePath,
    readFile: openFile,
    writeFile: saveFile,
    confirmLargeFile,
    showError: (message) => (error = message)
  });

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
    actions.newDocument(language);
    refreshDocuments();
  };

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    if (busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      await action();
    } finally {
      refreshDocuments();
      busy = false;
    }
  };

  const openExisting = (): void => {
    fileMenuOpen = false;
    void runAction(actions.openDialog);
  };

  const saveActive = (saveAs = false): void => {
    const id = snapshot.activeId;
    if (id === null) {
      return;
    }
    fileMenuOpen = false;
    void runAction(() => saveAs ? actions.saveAs(id) : actions.save(id));
  };

  const toggleTheme = (): void => {
    theme = theme === 'light' ? 'dark' : 'light';
  };

  onMount(() => {
    let disposed = false;
    let unlisten: () => void = () => undefined;
    void subscribeToFileDrops((paths) => runAction(() => actions.handleDroppedPaths(paths)))
      .then((stop) => {
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch((reason: unknown) => {
        error = reason instanceof Error ? reason.message : 'Unable to listen for dropped files.';
      });

    const onKeydown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        !(target instanceof Element) ||
        !appRoot.contains(target) ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        createDocument('plain');
      } else if (key === 'o') {
        event.preventDefault();
        openExisting();
      } else if (key === 's' && snapshot.activeId !== null) {
        event.preventDefault();
        saveActive(event.shiftKey);
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeydown);
      unlisten();
    };
  });
</script>

<main bind:this={appRoot} class="app-shell" role="application" aria-label={appName} data-theme={theme}>
  <header class="menu-bar">
    <div class="app-identity" aria-label="PrismPad">PrismPad</div>
    <nav class="app-menu" aria-label="Application menu">
      <button
        type="button"
        aria-expanded={fileMenuOpen}
        aria-controls="file-menu"
        onclick={() => (fileMenuOpen = !fileMenuOpen)}
      >File</button>
      <button type="button">Edit</button>
      <button type="button">View</button>
    </nav>
    {#if fileMenuOpen}
      <div class="file-menu" id="file-menu" role="menu" aria-label="File actions">
        <button type="button" role="menuitem" disabled={busy} onclick={() => createDocument('plain')}>New</button>
        <button type="button" role="menuitem" disabled={busy} onclick={openExisting}>Open</button>
        <button type="button" role="menuitem" disabled={busy || snapshot.activeId === null} onclick={() => saveActive()}>Save</button>
        <button type="button" role="menuitem" disabled={busy || snapshot.activeId === null} onclick={() => saveActive(true)}>Save As</button>
      </div>
    {/if}
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
    {#if error}
      <p class="file-error" role="alert">{error}</p>
    {/if}
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
