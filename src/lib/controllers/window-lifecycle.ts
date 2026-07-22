import type { SessionSnapshot } from '../native/store-api';

export type CloseAction = 'save' | 'discard' | 'cancel';
export type CloseDecision = Readonly<{ id: string; action: CloseAction }>;
type DirtyDocument = Readonly<{ id: string; title: string }>;
type ClosableDocument = Readonly<{ id: string; title: string; dirty: boolean }>;
type CloseSnapshot = Readonly<{
  activeId: string | null;
  documents: readonly Readonly<{ id: string; title: string; dirty: boolean }>[];
}>;

export type NativeCloseEvent = Readonly<{ preventDefault: () => void }>;
export type NativeWindow = Readonly<{
  onCloseRequested: (handler: (event: NativeCloseEvent) => void | Promise<void>) => Promise<() => void>;
  close: () => Promise<void>;
}>;

export type WindowLifecycleDeps = Readonly<{
  snapshot: () => CloseSnapshot;
  save: (id: string) => Promise<void>;
  isDirty: (id: string) => boolean;
  remove: (id: string) => void;
  requestDecisions: (documents: readonly DirtyDocument[]) => Promise<readonly CloseDecision[]>;
  persistSession: (snapshot: SessionSnapshot) => Promise<unknown>;
  window: NativeWindow;
  showError: (message: string) => void;
  isInteractionBlocked?: () => boolean;
}>;

export type DocumentCloseDeps = Readonly<{
  get: (id: string) => ClosableDocument | undefined;
  requestDecisions: (documents: readonly DirtyDocument[]) => Promise<readonly CloseDecision[]>;
  save: (id: string) => Promise<void>;
  isDirty: (id: string) => boolean;
  remove: (id: string) => void;
  showError: (message: string) => void;
}>;

export const resolveClose = (decisions: readonly CloseDecision[]): boolean =>
  decisions.every((decision) => decision.action !== 'cancel');

export const closeDocument = async (deps: DocumentCloseDeps, id: string): Promise<boolean> => {
  const document = deps.get(id);
  if (!document) {
    return false;
  }
  if (!document.dirty) {
    deps.remove(id);
    return true;
  }

  let decisions: readonly CloseDecision[];
  try {
    decisions = await deps.requestDecisions([document]);
  } catch {
    return false;
  }
  const action = decisions.find((decision) => decision.id === id)?.action;
  if (action === 'discard') {
    deps.remove(id);
    return true;
  }
  if (action !== 'save') {
    return false;
  }
  try {
    await deps.save(id);
  } catch {
    deps.showError(`Unable to save ${document.title}.`);
    return false;
  }
  if (deps.isDirty(id)) {
    return false;
  }
  deps.remove(id);
  return true;
};

export const createWindowLifecycle = (deps: WindowLifecycleDeps) => {
  let allowClose = false;
  let handlingClose = false;
  const abortForInteraction = (): boolean => {
    if (!deps.isInteractionBlocked?.()) return false;
    deps.showError('Resolve the external file-change prompt before closing PrismPad.');
    return true;
  };

  const onCloseRequested = async (event: NativeCloseEvent): Promise<void> => {
    if (allowClose) {
      return;
    }
    event.preventDefault();
    if (abortForInteraction()) return;
    if (handlingClose) {
      return;
    }
    handlingClose = true;
    try {
      while (true) {
        if (abortForInteraction()) return;
        const dirtyDocuments = deps.snapshot().documents.filter((document) => document.dirty);
        if (dirtyDocuments.length) {
          let decisions: readonly CloseDecision[];
          try {
            decisions = await deps.requestDecisions(dirtyDocuments);
          } catch {
            return;
          }
          if (abortForInteraction()) return;
          if (!resolveClose(decisions)) {
            return;
          }
          const actionById = new Map(decisions.map((decision) => [decision.id, decision.action]));
          if (dirtyDocuments.some((document) => !actionById.has(document.id))) {
            return;
          }
          for (const document of dirtyDocuments) {
            if (abortForInteraction()) return;
            if (actionById.get(document.id) === 'discard') {
              deps.remove(document.id);
            }
          }
          for (const document of dirtyDocuments) {
            if (abortForInteraction()) return;
            if (actionById.get(document.id) !== 'save') {
              continue;
            }
            try {
              await deps.save(document.id);
            } catch {
              deps.showError(`Unable to save ${document.title}.`);
              return;
            }
            if (abortForInteraction()) return;
            if (deps.isDirty(document.id)) {
              return;
            }
          }
          continue;
        }
        try {
          if (abortForInteraction()) return;
          await deps.persistSession(deps.snapshot() as unknown as SessionSnapshot);
        } catch {
          deps.showError('Unable to save the session. PrismPad will remain open.');
          return;
        }
        if (abortForInteraction()) return;
        if (deps.snapshot().documents.some((document) => document.dirty)) {
          continue;
        }
        allowClose = true;
        try {
          if (abortForInteraction()) { allowClose = false; return; }
          await deps.window.close();
        } catch {
          allowClose = false;
          deps.showError('Unable to close PrismPad.');
        }
        return;
      }
    } finally {
      handlingClose = false;
    }
  };

  return { onCloseRequested };
};

export const installWindowLifecycle = async (deps: WindowLifecycleDeps): Promise<() => void> =>
  deps.window.onCloseRequested(createWindowLifecycle(deps).onCloseRequested);
