import { defaultSuffixFor } from '../domain/languages';
import type { DiskMetadata, DocumentStore, OpenFilePayload } from '../domain/document';
import { normalizeDocumentPath } from '../stores/documents.svelte';
import type { FileCommandError, WriteFileRequest } from '../native/file-api';

export type DocumentActionDeps = Readonly<{
  documents: DocumentStore;
  chooseOpenPaths: () => Promise<string[]>;
  chooseSavePath: (suggestedName: string) => Promise<string | null>;
  readFile: (path: string, allowLarge: boolean) => Promise<OpenFilePayload>;
  writeFile: (request: WriteFileRequest) => Promise<DiskMetadata>;
  confirmLargeFile: (path: string, size: number) => Promise<boolean>;
  showError: (message: string) => void;
}>;

export type DocumentActions = Readonly<{
  newDocument: (language: Parameters<DocumentStore['createUntitled']>[0]) => string;
  openDialog: () => Promise<void>;
  openPaths: (paths: readonly string[]) => Promise<void>;
  save: (id: string) => Promise<void>;
  saveAs: (id: string) => Promise<void>;
  handleDroppedPaths: (paths: readonly string[]) => Promise<void>;
}>;

type CommandFailure = Pick<FileCommandError, 'code' | 'message' | 'size'>;

const basename = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

const isCommandFailure = (error: unknown): error is CommandFailure =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  'message' in error &&
  typeof error.code === 'string' &&
  typeof error.message === 'string';

const errorMessage = (error: unknown): string =>
  isCommandFailure(error) ? error.message : error instanceof Error ? error.message : 'An unexpected error occurred.';

const isSamePath = (left: string | null, right: string): boolean =>
  left !== null && normalizeDocumentPath(left) === normalizeDocumentPath(right);

export const createDocumentActions = (deps: DocumentActionDeps): DocumentActions => {
  const savesInProgress = new Set<string>();
  const saveAsInProgress = new Set<string>();
  const pathsInProgress = new Set<string>();
  let openDialogInProgress = false;

  const reportOpenFailure = (path: string, error: unknown): void => {
    deps.showError(`Unable to open ${basename(path)}: ${errorMessage(error)}`);
  };

  const openOne = async (path: string): Promise<void> => {
    const pathKey = normalizeDocumentPath(path);
    if (pathsInProgress.has(pathKey)) {
      return;
    }

    pathsInProgress.add(pathKey);
    try {
      let payload: OpenFilePayload;
      try {
        payload = await deps.readFile(path, false);
      } catch (error) {
        if (!isCommandFailure(error) || error.code !== 'large_file') {
          throw error;
        }
        const accepted = await deps.confirmLargeFile(path, error.size ?? 0);
        if (!accepted) {
          return;
        }
        payload = await deps.readFile(path, true);
      }
      deps.documents.openPath(payload);
    } catch (error) {
      reportOpenFailure(path, error);
    } finally {
      pathsInProgress.delete(pathKey);
    }
  };

  const saveToPath = async (id: string, path: string): Promise<void> => {
    if (savesInProgress.has(id)) {
      return;
    }

    const document = deps.documents.get(id);
    if (!document) {
      return;
    }

    savesInProgress.add(id);
    try {
      const samePath = isSamePath(document.path, path);
      const writtenText = document.text;
      const request: WriteFileRequest = {
        path,
        text: writtenText,
        bom: document.bom,
        lineEnding: document.lineEnding,
        expectedModifiedMs: samePath ? document.modifiedMs : null,
        expectedSize: samePath ? document.size : null,
        expectedRevision: samePath ? document.revision : null,
        overwriteExisting: !samePath
      };
      const metadata = await deps.writeFile(request);
      deps.documents.markSaved(id, metadata, writtenText);
    } catch (error) {
      deps.showError(`Unable to save ${document.title}: ${errorMessage(error)}`);
    } finally {
      savesInProgress.delete(id);
    }
  };

  const saveAs = async (id: string): Promise<void> => {
    if (savesInProgress.has(id) || saveAsInProgress.has(id)) {
      return;
    }
    const document = deps.documents.get(id);
    if (!document) {
      return;
    }
    const suggestedName = document.path === null
      ? `${document.title}${defaultSuffixFor(document.language)}`
      : document.title;
    saveAsInProgress.add(id);
    try {
      const path = await deps.chooseSavePath(suggestedName);
      if (path !== null) {
        await saveToPath(id, path);
      }
    } catch (error) {
      deps.showError(`Unable to choose a save location: ${errorMessage(error)}`);
    } finally {
      saveAsInProgress.delete(id);
    }
  };

  return {
    newDocument: (language) => deps.documents.createUntitled(language),

    openDialog: async () => {
      if (openDialogInProgress) {
        return;
      }
      openDialogInProgress = true;
      try {
        await Promise.all((await deps.chooseOpenPaths()).map(openOne));
      } catch (error) {
        deps.showError(`Unable to choose files: ${errorMessage(error)}`);
      } finally {
        openDialogInProgress = false;
      }
    },

    openPaths: async (paths) => {
      await Promise.all(paths.map(openOne));
    },

    save: async (id) => {
      if (saveAsInProgress.has(id)) {
        return;
      }
      const document = deps.documents.get(id);
      if (!document) {
        return;
      }
      if (document.path === null) {
        await saveAs(id);
        return;
      }
      await saveToPath(id, document.path);
    },

    saveAs: async (id) => {
      await saveAs(id);
    },

    handleDroppedPaths: async (paths) => {
      await Promise.all(paths.map(openOne));
    }
  };
};
