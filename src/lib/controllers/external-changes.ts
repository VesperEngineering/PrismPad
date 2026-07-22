import type { DiskMetadata, OpenFilePayload } from '../domain/document';

export type ExternalChangeDocument = Readonly<{
  id: string;
  path: string;
  text: string;
  dirty: boolean;
  modifiedMs: number | null;
  size: number;
  revision: string | null;
}>;

export type ExternalChangePrompt = Readonly<{
  documentId: string;
  path: string;
  editorText: string;
  disk: OpenFilePayload;
  source: ExternalChangeDocument;
}>;

export type ExternalChangeDeps = Readonly<{
  findDocumentByPath: (path: string) => ExternalChangeDocument | undefined;
  autoReloadCleanFiles: () => boolean;
  readFile: (path: string, allowLarge: boolean) => Promise<OpenFilePayload>;
  replaceFromDisk: (documentId: string, file: OpenFilePayload) => void;
  observeDisk: (documentId: string, metadata: DiskMetadata) => void;
  prompt: (change: ExternalChangePrompt) => void;
  isPromptCurrent: (change: ExternalChangePrompt) => boolean;
  invalidatePrompts: (path: string, expected?: ExternalChangePrompt) => void;
  notify: (message: string) => void;
}>;

export type ExternalChangeController = Readonly<{
  onChanged: (path: string) => Promise<void>;
  reload: (change: ExternalChangePrompt) => Promise<boolean>;
  keepEditorVersion: (change: ExternalChangePrompt) => boolean;
}>;

export type PathWatchDeps = Readonly<{
  paths: () => readonly string[];
  watch: (path: string) => Promise<void>;
  unwatch: (path: string) => Promise<void>;
}>;

export type PathWatchController = Readonly<{
  sync: () => Promise<void>;
  dispose: () => Promise<void>;
}>;

/** Reconciles native watcher ownership with the currently open canonical paths. */
export const createPathWatchController = (deps: PathWatchDeps): PathWatchController => {
  const watched = new Set<string>();
  let work = Promise.resolve();
  let disposed = false;

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    work = work.catch(() => undefined).then(operation);
    return work;
  };

  return {
    sync: () => enqueue(async () => {
      if (disposed) {
        return;
      }
      const desired = new Set(deps.paths());
      for (const path of [...watched]) {
        if (!desired.has(path)) {
          await deps.unwatch(path);
          watched.delete(path);
        }
      }
      for (const path of desired) {
        if (!watched.has(path)) {
          await deps.watch(path);
          watched.add(path);
        }
      }
    }),
    dispose: () => {
      disposed = true;
      return enqueue(async () => {
        const failures: unknown[] = [];
        for (const path of [...watched]) {
          try {
            await deps.unwatch(path);
          } catch (error) {
            failures.push(error);
          }
          watched.delete(path);
        }
        if (failures.length) {
          throw new AggregateError(failures, 'Unable to stop every file watcher.');
        }
      });
    }
  };
};

const sameDiskVersion = (document: ExternalChangeDocument, file: OpenFilePayload): boolean =>
  document.revision !== null
    ? document.revision === file.revision
    : document.modifiedMs === file.modifiedMs && document.size === file.size;

const sameDocumentState = (left: ExternalChangeDocument, right: ExternalChangeDocument): boolean =>
  left.id === right.id
  && left.path === right.path
  && left.text === right.text
  && left.dirty === right.dirty
  && left.modifiedMs === right.modifiedMs
  && left.size === right.size
  && left.revision === right.revision;

export const matchesExternalChangeSource = (
  change: ExternalChangePrompt,
  document: ExternalChangeDocument | undefined
): document is ExternalChangeDocument => document !== undefined && sameDocumentState(change.source, document);

const failureMessage = (path: string): string =>
  `The file at ${path} could not be read or may have been deleted. Your editor version was kept open.`;

/** Serializes each watched path and coalesces a burst into one final disk read. */
export const createExternalChangeController = (deps: ExternalChangeDeps): ExternalChangeController => {
  const pendingByPath = new Map<string, boolean>();
  const runningByPath = new Map<string, Promise<void>>();
  const handledDiskVersionByPath = new Map<string, string>();
  const diskVersionKey = (file: OpenFilePayload): string =>
    `${file.revision}:${file.modifiedMs}:${file.size}`;

  const processOne = async (path: string): Promise<void> => {
    const documentBeforeRead = deps.findDocumentByPath(path);
    if (!documentBeforeRead) {
      deps.invalidatePrompts(path);
      return;
    }
    const beforeRead = { ...documentBeforeRead };
    let disk: OpenFilePayload;
    try {
      disk = await deps.readFile(path, false);
    } catch {
      handledDiskVersionByPath.delete(path);
      deps.invalidatePrompts(path);
      if (deps.findDocumentByPath(path)?.id === beforeRead.id) {
        deps.notify(failureMessage(path));
      }
      return;
    }

    const document = deps.findDocumentByPath(path);
    if (
      !document ||
      document.id !== beforeRead.id ||
      document.path !== beforeRead.path ||
      document.text !== beforeRead.text ||
      document.dirty !== beforeRead.dirty ||
      document.modifiedMs !== beforeRead.modifiedMs ||
      document.size !== beforeRead.size ||
      document.revision !== beforeRead.revision ||
      sameDiskVersion(document, disk)
    ) {
      return;
    }
    const change: ExternalChangePrompt = {
      documentId: document.id,
      path,
      editorText: document.text,
      disk,
      source: { ...document }
    };
    const diskVersion = diskVersionKey(disk);
    if (handledDiskVersionByPath.get(path) === diskVersion) {
      return;
    }
    if (!document.dirty && deps.autoReloadCleanFiles()) {
      deps.replaceFromDisk(document.id, disk);
      handledDiskVersionByPath.set(path, diskVersion);
      deps.notify(`Reloaded ${path} after it changed on disk.`);
    } else {
      handledDiskVersionByPath.set(path, diskVersion);
      deps.prompt(change);
    }
  };

  const onChanged = (path: string): Promise<void> => {
    pendingByPath.set(path, true);
    const running = runningByPath.get(path);
    if (running) {
      return running;
    }
    const work = (async () => {
      while (pendingByPath.get(path)) {
        pendingByPath.set(path, false);
        await processOne(path);
      }
    })().finally(() => {
      pendingByPath.delete(path);
      runningByPath.delete(path);
    });
    runningByPath.set(path, work);
    return work;
  };

  return {
    onChanged,
    reload: async (change) => {
      const beforeRead = deps.findDocumentByPath(change.path);
      if (!matchesExternalChangeSource(change, beforeRead)) {
        deps.invalidatePrompts(change.path, change);
        return false;
      }
      let disk: OpenFilePayload;
      try {
        disk = await deps.readFile(change.path, false);
      } catch {
        handledDiskVersionByPath.delete(change.path);
        deps.invalidatePrompts(change.path);
        deps.notify(failureMessage(change.path));
        return false;
      }
      const document = deps.findDocumentByPath(change.path);
      if (
        !matchesExternalChangeSource(change, document)
        || !sameDocumentState(beforeRead, document)
        || sameDiskVersion(document, disk)
      ) {
        deps.invalidatePrompts(change.path, change);
        return false;
      }
      // No await may occur between this exact-decision check and replacement.
      // A newer same-path prompt must retain ownership of the document decision.
      if (!deps.isPromptCurrent(change)) {
        return false;
      }
      handledDiskVersionByPath.set(change.path, diskVersionKey(disk));
      deps.replaceFromDisk(change.documentId, disk);
      return true;
    },
    keepEditorVersion: (change) => {
      if (!matchesExternalChangeSource(change, deps.findDocumentByPath(change.path))) {
        deps.invalidatePrompts(change.path, change);
        return false;
      }
      handledDiskVersionByPath.set(change.path, diskVersionKey(change.disk));
      deps.observeDisk(change.documentId, change.disk);
      return true;
    }
  };
};
