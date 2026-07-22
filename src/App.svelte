<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TabStrip from './lib/components/TabStrip.svelte';
  import WelcomeView from './lib/components/WelcomeView.svelte';
  import EditorPane from './lib/components/EditorPane.svelte';
  import MarkdownPreview from './lib/components/MarkdownPreview.svelte';
  import FindPanel from './lib/components/FindPanel.svelte';
  import StatusBar from './lib/components/StatusBar.svelte';
  import UnsavedDialog from './lib/components/UnsavedDialog.svelte';
  import ExternalChangeDialog from './lib/components/ExternalChangeDialog.svelte';
  import DiffView from './lib/components/DiffView.svelte';
  import type { PrismEditor } from './lib/editor/create-editor';
  import { LANGUAGES } from './lib/domain/languages';
  import type { DocumentSnapshot } from './lib/domain/document';
  import { createDocumentActions } from './lib/controllers/document-actions';
  import {
    createExternalChangeController,
    createPathWatchController,
    matchesExternalChangeSource,
    type ExternalChangePrompt
  } from './lib/controllers/external-changes';
  import { createExternalPromptQueue } from './lib/controllers/external-prompt-queue';
  import {
    closeDocument,
    installWindowLifecycle,
    type CloseDecision
  } from './lib/controllers/window-lifecycle';
  import {
    loadPreferencesWithStatus,
    loadSession,
    restoreSession,
    savePreferences,
    saveSession
  } from './lib/native/store-api';
  import {
    chooseOpenPaths,
    chooseSavePath,
    confirmOverwrite,
    confirmLargeFile,
    openFile,
    saveFile,
    subscribeToExternalChanges,
    subscribeToFileDrops,
    unwatchPath,
    watchPath
  } from './lib/native/file-api';
  import {
    DEFAULT_PREFERENCES,
    subscribeToResolvedTheme,
    type Preferences
  } from './lib/stores/preferences.svelte';
  import { createDocumentStore } from './lib/stores/documents.svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';
  import { commandForShortcut, createCommandController } from './lib/controllers/commands';
  import { syncNativeMenuAvailability } from './lib/native/menu-api';

  const appName = 'PrismPad';
  const documentStore = createDocumentStore();

  let snapshot = $state<DocumentSnapshot>(documentStore.snapshot());
  let theme = $state<'light' | 'dark'>('light');
  let preferences = $state<Preferences>(DEFAULT_PREFERENCES);
  let editor = $state<PrismEditor | null>(null);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let openMenu = $state<'file' | 'edit' | 'view' | 'help' | null>(null);
  let markdownPreviewOpen = $state(false);
  let menuReturnFocus = $state<HTMLButtonElement | null>(null);
  let menuElement = $state<HTMLElement | null>(null);
  let appRoot: HTMLElement;
  let dirtyDocumentsForClose = $state<readonly { id: string; title: string }[] | null>(null);
  let resolveCloseDialog = $state<((decisions: readonly CloseDecision[]) => void) | null>(null);
  let preferencesChangedDuringLoad = false;
  let externalChange = $state<ExternalChangePrompt | null>(null);
  let comparison = $state<ExternalChangePrompt | null>(null);
  let externalDecisionBusy = $state(false);
  let requestWatchSync: () => void = () => undefined;
  let findMode = $state<'find' | 'replace' | null>(null);

  const externalPromptQueue = createExternalPromptQueue({
    isCurrent: (change) => {
      const document = documentStore.get(change.documentId);
      return document?.path === change.path
        && matchesExternalChangeSource(change, { ...document, path: document.path });
    },
    onChange: ({ current, comparing }) => {
      externalChange = comparing ? null : current;
      comparison = comparing ? current : null;
    }
  });

  const actions = createDocumentActions({
    documents: documentStore,
    chooseOpenPaths,
    chooseSavePath,
    readFile: openFile,
    writeFile: saveFile,
    confirmLargeFile,
    confirmOverwrite,
    showError: (message) => (error = message)
  });

  const activeDocument = $derived(
    snapshot.documents.find((document) => document.id === snapshot.activeId) ?? null
  );
  const activeLanguage = $derived(
    activeDocument ? LANGUAGES.find((language) => language.id === activeDocument.language) : null
  );
  const hasMarkdownPreview = $derived(activeDocument?.language === 'markdown');
  const previewVisible = $derived(hasMarkdownPreview && markdownPreviewOpen);
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
    externalPromptQueue.reconcile();
    requestWatchSync();
  };

  const appendNotice = (message: string): void => {
    notice = notice ? `${notice} ${message}` : message;
  };

  const externalChanges = createExternalChangeController({
    findDocumentByPath: (path) => {
      const document = documentStore.snapshot().documents.find((candidate) => candidate.path === path);
      return document?.path === null || !document ? undefined : { ...document, path: document.path };
    },
    autoReloadCleanFiles: () => preferences.autoReloadCleanFiles,
    readFile: openFile,
    replaceFromDisk: (id, file) => {
      documentStore.replaceFromDisk(id, file);
      refreshDocuments();
    },
    observeDisk: (id, metadata) => {
      documentStore.observeDisk(id, metadata);
      refreshDocuments();
    },
    prompt: externalPromptQueue.enqueue,
    isPromptCurrent: externalPromptQueue.isCurrent,
    invalidatePrompts: externalPromptQueue.invalidatePath,
    notify: appendNotice
  });

  const decideExternalChange = async (
    change: ExternalChangePrompt,
    decide: (pending: ExternalChangePrompt) => boolean | Promise<boolean>
  ): Promise<void> => {
    if (externalDecisionBusy) {
      return;
    }
    externalDecisionBusy = true;
    try {
      if (await decide(change)) {
        // A newer same-path prompt may have arrived while a reload was reading.
        externalPromptQueue.resolveCurrent(change);
      }
    } finally {
      externalDecisionBusy = false;
      refreshDocuments();
    }
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

  const openExisting = async (): Promise<void> => {
    await runAction(actions.openDialog);
  };

  /** Kept as a named action so Task 11 can route `view.markdownPreview` here. */
  const toggleMarkdownPreview = (): void => {
    if (!hasMarkdownPreview) {
      return;
    }
    markdownPreviewOpen = !markdownPreviewOpen;
    openMenu = null;
    menuReturnFocus?.focus();
  };

  const isTauriRuntime = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  let stopThemeSubscription: () => void = () => undefined;
  const applyPreferences = (nextPreferences: Preferences): void => {
    preferences = nextPreferences;
    stopThemeSubscription();
    stopThemeSubscription = subscribeToResolvedTheme(preferences, (nextTheme) => (theme = nextTheme));
  };

  const toggleTheme = (): void => {
    preferencesChangedDuringLoad = true;
    const nextPreferences: Preferences = {
      ...preferences,
      theme: theme === 'light' ? 'dark' : 'light'
    };
    applyPreferences(nextPreferences);
    void savePreferences(nextPreferences).catch(() => {
      error = 'Unable to save preferences.';
    });
  };

  const requestCloseDecisions = (documents: readonly { id: string; title: string }[]): Promise<readonly CloseDecision[]> =>
    new Promise((resolve) => {
      if (resolveCloseDialog) {
        resolve(documents.map((document) => ({ id: document.id, action: 'cancel' })));
        return;
      }
      dirtyDocumentsForClose = documents;
      resolveCloseDialog = resolve;
    });

  const closeTab = (id: string): void => {
    void closeDocument({
      get: documentStore.get,
      requestDecisions: requestCloseDecisions,
      save: actions.save,
      isDirty: (documentId) => documentStore.get(documentId)?.dirty ?? false,
      remove: documentStore.remove,
      showError: (message) => (error = message)
    }, id).finally(refreshDocuments);
  };

  const closeActive = async (): Promise<void> => {
    if (snapshot.activeId) closeTab(snapshot.activeId);
  };

  const updatePreferences = (patch: Partial<Preferences>): void => {
    preferencesChangedDuringLoad = true;
    const nextPreferences = { ...preferences, ...patch };
    applyPreferences(nextPreferences);
    void savePreferences(nextPreferences).catch(() => (error = 'Unable to save preferences.'));
  };

  const commandController = createCommandController({
    activeId: () => snapshot.activeId,
    newDocument: () => createDocument('plain'),
    openDialog: async () => openExisting(),
    save: async (id) => saveActiveFor(id, false),
    saveAs: async (id) => saveActiveFor(id, true),
    closeActive,
    openFind: () => (findMode = 'find'),
    openReplace: () => (findMode = 'replace'),
    toggleWrap: () => updatePreferences({ wordWrap: !preferences.wordWrap }),
    toggleMarkdownPreview,
    zoomIn: () => updatePreferences({ fontSize: Math.min(32, preferences.fontSize + 1) }),
    zoomOut: () => updatePreferences({ fontSize: Math.max(10, preferences.fontSize - 1) }),
    cycleTheme: toggleTheme,
    isBusy: () => busy,
    hasActiveModal: () => externalChange !== null || comparison !== null || dirtyDocumentsForClose !== null || externalDecisionBusy,
    isMarkdown: () => hasMarkdownPreview,
    fontSize: () => preferences.fontSize
  });

  $effect(() => {
    const availability = Object.fromEntries(commandController.ids.map((id) => [id, commandController.canExecute(id)])) as Record<typeof commandController.ids[number], boolean>;
    void syncNativeMenuAvailability(availability).catch(() => undefined);
  });

  const saveActiveFor = async (id: string, saveAs: boolean): Promise<void> => {
    if (snapshot.activeId !== id || busy) return;
    await runAction(() => saveAs ? actions.saveAs(id) : actions.save(id));
  };

  const toggleMenu = (menu: 'file' | 'edit' | 'view' | 'help', button: HTMLButtonElement): void => {
    menuReturnFocus = button;
    openMenu = openMenu === menu ? null : menu;
    if (openMenu) void tick().then(() => {
      const items = Array.from(menuElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      items.forEach((item, index) => (item.tabIndex = index === 0 ? 0 : -1));
      items[0]?.focus();
    });
  };

  const dismissMenu = (): void => {
    openMenu = null;
    menuReturnFocus?.focus();
  };

  const executeMenuCommand = (id: Parameters<typeof commandController.execute>[0]): void => {
    dismissMenu();
    void commandController.execute(id);
  };

  const handleMenuButtonKey = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const buttons = Array.from(appRoot.querySelectorAll<HTMLButtonElement>('[data-menu-button]'));
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus();
    const menu = next?.dataset.menu as 'file' | 'edit' | 'view' | 'help' | undefined;
    if (openMenu && menu) toggleMenu(menu, next);
  };

  const switchOpenMenu = (direction: 1 | -1): void => {
    const buttons = Array.from(appRoot.querySelectorAll<HTMLButtonElement>('[data-menu-button][data-menu]'));
    const index = buttons.indexOf(menuReturnFocus ?? buttons[0]);
    const next = buttons[(index + direction + buttons.length) % buttons.length];
    const menu = next?.dataset.menu as 'file' | 'edit' | 'view' | 'help' | undefined;
    if (next && menu) { next.focus(); toggleMenu(menu, next); }
  };

  const handleMenuKey = (event: KeyboardEvent): void => {
    const menu = event.currentTarget as HTMLElement;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = items.indexOf(event.target as HTMLButtonElement);
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); dismissMenu(); return; }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); switchOpenMenu(event.key === 'ArrowRight' ? 1 : -1); return; }
    if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((item, itemIndex) => (item.tabIndex = itemIndex === next ? 0 : -1));
    items[next]?.focus();
  };

  onMount(() => {
    let disposed = false;
    let unlisten: () => void = () => undefined;
    let stopExternalChanges: () => void = () => undefined;
    let stopCloseLifecycle: () => void = () => undefined;
    const pathWatchers = createPathWatchController({
      paths: () => documentStore.snapshot().documents.flatMap((document) => document.path === null ? [] : [document.path]),
      watch: watchPath,
      unwatch: unwatchPath
    });
    requestWatchSync = () => {
      void pathWatchers.sync().catch(() => {
        if (!disposed) {
          error = 'Unable to watch open files for external changes.';
        }
      });
    };
    requestWatchSync();

    void subscribeToExternalChanges((path) => {
      void externalChanges.onChanged(path);
    }).then((stop) => {
      if (disposed) {
        stop();
      } else {
        stopExternalChanges = stop;
      }
    }).catch(() => {
      if (!disposed) {
        error = 'Unable to listen for external file changes.';
      }
    });
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

    const hasActiveModal = (): boolean => externalChange !== null || comparison !== null || dirtyDocumentsForClose !== null || externalDecisionBusy;
    const onKeydown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (event.key === 'Escape' && !hasActiveModal()) {
        if (openMenu) {
          event.preventDefault();
          dismissMenu();
        } else if (findMode) {
          event.preventDefault();
          findMode = null;
          editor?.focus();
        }
        return;
      }
      if (
        event.defaultPrevented ||
        isTauriRuntime() ||
        hasActiveModal() ||
        !(target instanceof Element) ||
        !appRoot.contains(target) ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      const id = commandForShortcut(event);
      if (id && commandController.canExecute(id)) {
        event.preventDefault();
        void commandController.execute(id);
      }
    };

    window.addEventListener('keydown', onKeydown);
    const onPointerDown = (event: PointerEvent): void => {
      if (openMenu && event.target instanceof Element && !event.target.closest('.menu-bar')) dismissMenu();
    };
    window.addEventListener('pointerdown', onPointerDown);
    let stopNativeCommands: () => void = () => undefined;
    if (isTauriRuntime()) {
      void listen<string>('prismpad://command', (event) => {
        if (!hasActiveModal()) void commandController.executeNative(event.payload);
      }).then((stop) => {
        if (disposed) stop(); else stopNativeCommands = stop;
      });
    }

    void (async () => {
      try {
        const loaded = await loadPreferencesWithStatus();
        if (disposed) {
          return;
        }
        if (!preferencesChangedDuringLoad) {
          applyPreferences(loaded.preferences);
        }
        if (loaded.recovered) {
          appendNotice('Some saved preferences were invalid and have been reset.');
        }
      } catch {
        if (!disposed && !preferencesChangedDuringLoad) {
          applyPreferences(DEFAULT_PREFERENCES);
        }
        if (!disposed) {
          appendNotice('Saved preferences could not be loaded; defaults are in use.');
        }
      }
      try {
        const session = await loadSession();
        if (!session) {
          return;
        }
        const restored = await restoreSession(session, openFile);
        if (disposed) {
          return;
        }
        for (const restoredTab of restored.files) {
          const id = documentStore.openPath(restoredTab.file);
          documentStore.setSelection(id, restoredTab.anchor, restoredTab.head);
        }
        if (restored.activePath) {
          const activeId = documentStore
            .snapshot()
            .documents
            .find((document) => document.path === restored.activePath)?.id;
          if (activeId) {
            documentStore.activate(activeId);
          }
        }
        refreshDocuments();
        if (restored.skipped.length) {
          appendNotice(`${restored.skipped.length} previously open file${restored.skipped.length === 1 ? '' : 's'} could not be restored.`);
        }
      } catch {
        if (!disposed) {
          appendNotice('Saved session information could not be restored.');
        }
      }
    })();

    if (isTauriRuntime()) {
      void installWindowLifecycle({
        snapshot: documentStore.snapshot,
        save: actions.save,
        isDirty: (id) => documentStore.get(id)?.dirty ?? false,
        remove: documentStore.remove,
        requestDecisions: requestCloseDecisions,
        persistSession: saveSession,
        window: getCurrentWindow(),
        isInteractionBlocked: () => externalChange !== null || comparison !== null || externalDecisionBusy,
        showError: (message) => (error = message)
      }).then((stop) => {
        if (disposed) {
          stop();
        } else {
          stopCloseLifecycle = stop;
        }
      }).catch(() => {
        if (!disposed) {
          error = 'Unable to protect unsaved documents before closing.';
        }
      });
    }

    return () => {
      disposed = true;
      requestWatchSync = () => undefined;
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('pointerdown', onPointerDown);
      unlisten();
      stopExternalChanges();
      stopThemeSubscription();
      stopCloseLifecycle();
      stopNativeCommands();
      void pathWatchers.dispose().catch(() => undefined);
      resolveCloseDialog?.(dirtyDocumentsForClose?.map((document) => ({ id: document.id, action: 'cancel' })) ?? []);
    };
  });
</script>

<main bind:this={appRoot} class="app-shell" role="application" aria-label={appName} data-theme={theme}>
  <header class="menu-bar">
    <div class="app-identity" aria-label="PrismPad">PrismPad</div>
    <nav class="app-menu" aria-label="Application menu">
      <button
        data-menu-button
        data-menu="file"
        type="button"
        aria-expanded={openMenu === 'file'}
        aria-controls="file-menu"
        onclick={(event) => toggleMenu('file', event.currentTarget)}
        onkeydown={handleMenuButtonKey}
      >File</button>
      <button data-menu-button data-menu="edit" type="button" aria-expanded={openMenu === 'edit'} aria-controls="edit-menu" onclick={(event) => toggleMenu('edit', event.currentTarget)} onkeydown={handleMenuButtonKey}>Edit</button>
      <button
        data-menu-button
        data-menu="view"
        type="button"
        aria-expanded={openMenu === 'view'}
        aria-controls="view-menu"
        onclick={(event) => toggleMenu('view', event.currentTarget)}
        onkeydown={handleMenuButtonKey}
      >View</button>
      <button data-menu-button data-menu="help" type="button" aria-expanded={openMenu === 'help'} aria-controls="help-menu" onclick={(event) => toggleMenu('help', event.currentTarget)} onkeydown={handleMenuButtonKey}>Help</button>
    </nav>
    {#if openMenu === 'file'}
      <div bind:this={menuElement} class="file-menu" id="file-menu" role="menu" aria-label="File actions" tabindex="-1" onkeydown={handleMenuKey}>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('file.new')} onclick={() => executeMenuCommand('file.new')}>New</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('file.open')} onclick={() => executeMenuCommand('file.open')}>Open</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('file.save')} onclick={() => executeMenuCommand('file.save')}>Save</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('file.saveAs')} onclick={() => executeMenuCommand('file.saveAs')}>Save As</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('file.close')} onclick={() => executeMenuCommand('file.close')}>Close</button>
      </div>
    {/if}
    {#if openMenu === 'edit'}
      <div bind:this={menuElement} class="file-menu edit-menu" id="edit-menu" role="menu" aria-label="Edit actions" tabindex="-1" onkeydown={handleMenuKey}>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('edit.find')} onclick={() => executeMenuCommand('edit.find')}>Find</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('edit.replace')} onclick={() => executeMenuCommand('edit.replace')}>Replace</button>
      </div>
    {/if}
    {#if openMenu === 'view'}
      <div bind:this={menuElement} class="file-menu view-menu" id="view-menu" role="menu" aria-label="View actions" tabindex="-1" onkeydown={handleMenuKey}>
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={previewVisible}
          disabled={!commandController.canExecute('view.markdownPreview')}
          onclick={() => executeMenuCommand('view.markdownPreview')}
        >Markdown preview</button>
        <button type="button" role="menuitemcheckbox" disabled={!commandController.canExecute('view.wrap')} aria-checked={preferences.wordWrap} onclick={() => executeMenuCommand('view.wrap')}>Word wrap</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('view.zoomIn')} onclick={() => executeMenuCommand('view.zoomIn')}>Zoom in</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('view.zoomOut')} onclick={() => executeMenuCommand('view.zoomOut')}>Zoom out</button>
        <button type="button" role="menuitem" disabled={!commandController.canExecute('view.theme')} onclick={() => executeMenuCommand('view.theme')}>Cycle theme</button>
      </div>
    {/if}
    {#if openMenu === 'help'}
      <div bind:this={menuElement} class="file-menu help-menu" id="help-menu" role="menu" aria-label="Help actions" tabindex="-1" onkeydown={handleMenuKey}>
        <button type="button" role="menuitem" onclick={() => { dismissMenu(); appendNotice('PrismPad is a local-only text editor.'); }}>About PrismPad</button>
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
        closeTab(id);
      }}
      onReorder={(sourceId, targetId) => {
        documentStore.reorder(sourceId, targetId);
        refreshDocuments();
      }}
      onEscape={() => editor?.focus()}
    />
  {:else}
    <div class="tab-strip empty-tab-strip" aria-hidden="true"></div>
  {/if}

  <section class="workspace" aria-live="polite">
    {#snippet interfaceFailure(_error: unknown, reset: () => void)}
      <div class="interface-error" role="alert">
        <p>PrismPad encountered an interface error. Your open documents remain in memory.</p>
        <button type="button" onclick={reset}>Retry interface</button>
      </div>
    {/snippet}
    <svelte:boundary failed={interfaceFailure}>
    {#if error}
      <p class="file-error" role="alert">{error}</p>
    {/if}
    {#if notice}
      <p class="editor-notice" role="status">{notice}</p>
    {/if}
    {#if snapshot.documents.length === 0}
      <WelcomeView onSelect={createDocument} onOpenExisting={openExisting} />
    {:else if activeDocument}
      <div
        class:with-markdown-preview={previewVisible}
        class="document-canvas"
        id={`document-${activeDocument.id}`}
        aria-labelledby={`tab-${activeDocument.id}`}
      >
        <div class="editor-preview">
          <EditorPane
            document={activeDocument}
            dark={theme === 'dark'}
            {preferences}
            onTextChange={(id, text) => {
              documentStore.applyEdit(id, text);
              refreshDocuments();
            }}
            onCursorChange={(id, anchor, head) => {
              documentStore.setSelection(id, anchor, head);
              refreshDocuments();
            }}
            onNotice={appendNotice}
            onReady={(nextEditor) => (editor = nextEditor)}
          />
          {#if previewVisible}
            <MarkdownPreview source={activeDocument.text} />
          {/if}
        </div>
        <FindPanel {editor} mode={findMode} onClose={() => (findMode = null)} />
      </div>
    {/if}
    </svelte:boundary>
  </section>

  <StatusBar
    language={activeLanguage?.label ?? 'Welcome'}
    {cursor}
    encoding={activeDocument?.encoding.toUpperCase() ?? 'Local only'}
    lineEnding={activeDocument?.lineEnding.toUpperCase() ?? 'No document open'}
    {preferences}
    onPreferencesChange={(nextPreferences) => updatePreferences(nextPreferences)}
  />

  {#if dirtyDocumentsForClose && resolveCloseDialog}
    <UnsavedDialog
      documents={dirtyDocumentsForClose}
      onResolve={(decisions) => {
        const resolve = resolveCloseDialog;
        dirtyDocumentsForClose = null;
        resolveCloseDialog = null;
        if (resolve) {
          resolve(decisions);
        }
      }}
    />
  {/if}

  {#if externalChange && !comparison && !dirtyDocumentsForClose}
    <ExternalChangeDialog
      change={externalChange}
      busy={externalDecisionBusy}
      onReload={() => void decideExternalChange(externalChange!, externalChanges.reload)}
      onCompare={() => {
        if (!externalDecisionBusy) {
          externalPromptQueue.beginCompare();
        }
      }}
      onKeep={() => void decideExternalChange(externalChange!, externalChanges.keepEditorVersion)}
      onDismiss={() => void decideExternalChange(externalChange!, externalChanges.keepEditorVersion)}
    />
  {/if}

  {#if comparison && !dirtyDocumentsForClose}
    {#key `${comparison.documentId}\u0000${comparison.path}\u0000${comparison.disk.revision}`}
      <DiffView diskText={comparison.disk.text} editorText={comparison.editorText} onClose={() => externalPromptQueue.closeCompare()} />
    {/key}
  {/if}
</main>
