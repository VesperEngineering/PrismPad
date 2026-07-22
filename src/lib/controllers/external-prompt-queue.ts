import type { ExternalChangePrompt } from './external-changes';

export type ExternalPromptQueueState = Readonly<{
  current: ExternalChangePrompt | null;
  comparing: boolean;
}>;

export type ExternalPromptQueueDeps = Readonly<{
  onChange: (state: ExternalPromptQueueState) => void;
  isCurrent?: (change: ExternalChangePrompt) => boolean;
}>;

export type ExternalPromptQueue = Readonly<{
  enqueue: (change: ExternalChangePrompt) => void;
  beginCompare: () => ExternalChangePrompt | null;
  closeCompare: () => void;
  isCurrent: (change: ExternalChangePrompt) => boolean;
  resolveCurrent: (expected?: ExternalChangePrompt) => ExternalChangePrompt | null;
  invalidatePath: (path: string, expected?: ExternalChangePrompt) => void;
  reconcile: () => void;
}>;

const keyFor = (change: ExternalChangePrompt): string => `${change.documentId}\u0000${change.path}`;

/**
 * Owns external-change decisions independently from the UI. A visible decision
 * is never replaced by another path, while a newer observation for the same
 * document/path replaces stale disk text in place.
 */
export const createExternalPromptQueue = (deps: ExternalPromptQueueDeps): ExternalPromptQueue => {
  const queued = new Map<string, ExternalChangePrompt>();
  const isValid = deps.isCurrent ?? (() => true);
  let current: ExternalChangePrompt | null = null;
  let comparing = false;

  const advanceToCurrent = (): void => {
    if (current && !isValid(current)) {
      current = null;
      comparing = false;
    }
    while (!current && queued.size) {
      const first = queued.entries().next().value as [string, ExternalChangePrompt] | undefined;
      if (!first) {
        return;
      }
      queued.delete(first[0]);
      if (isValid(first[1])) {
        current = first[1];
      }
    }
  };

  const publish = (): void => {
    advanceToCurrent();
    deps.onChange({ current, comparing });
  };

  return {
    enqueue: (change) => {
      const key = keyFor(change);
      if (current && keyFor(current) === key) {
        current = change;
      } else {
        queued.set(key, change);
      }
      publish();
    },
    beginCompare: () => {
      advanceToCurrent();
      if (current) {
        comparing = true;
        deps.onChange({ current, comparing });
      }
      return current;
    },
    closeCompare: () => {
      if (comparing) {
        comparing = false;
        publish();
      }
    },
    isCurrent: (change) => current === change && isValid(change),
    resolveCurrent: (expected) => {
      advanceToCurrent();
      if (expected && current !== expected) {
        return null;
      }
      const resolved = current;
      current = null;
      comparing = false;
      publish();
      return resolved;
    },
    invalidatePath: (path, expected) => {
      if (current?.path === path && (!expected || current === expected)) {
        current = null;
        comparing = false;
      }
      for (const [key, change] of queued) {
        if (change.path === path && (!expected || change === expected)) {
          queued.delete(key);
        }
      }
      publish();
    },
    reconcile: publish
  };
};
