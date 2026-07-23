import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { listen } from '@tauri-apps/api/event';
import { ask, open, save } from '@tauri-apps/plugin-dialog';
import type { DiskMetadata, LineEnding, OpenFilePayload } from '../domain/document';

export type WriteFileRequest = Readonly<{
  path: string;
  text: string;
  bom: boolean;
  lineEnding: LineEnding;
  expectedModifiedMs: number | null;
  expectedSize: number | null;
  /** Null is valid for a new target or an explicitly confirmed Save As overwrite. */
  expectedRevision: string | null;
  /** Explicit Save As permission after the native dialog has confirmed an existing target. */
  overwriteExisting: boolean;
}>;

export type FileCommandError = Readonly<{
  code: 'binary' | 'unsupported_encoding' | 'conflict' | 'large_file' | 'io';
  message: string;
  size?: number;
}>;

export async function openFile(path: string, allowLarge = false): Promise<OpenFilePayload> {
  return invoke<OpenFilePayload>('read_text_file', { path, allowLarge });
}

export async function saveFile(request: WriteFileRequest): Promise<DiskMetadata> {
  return invoke<DiskMetadata>('write_text_file', { request });
}

export const watchPath = (path: string): Promise<void> =>
  invoke<void>('watch_path', { path });

export const unwatchPath = (path: string): Promise<void> =>
  invoke<void>('unwatch_path', { path });

export const subscribeToExternalChanges = async (onChange: (path: string) => void): Promise<() => void> => {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return () => undefined;
  }
  return listen<{ path: string }>('file-changed', (event) => onChange(event.payload.path));
};

export const chooseOpenPaths = async (): Promise<string[]> => {
  const selected = await open({ directory: false, multiple: true });
  if (selected === null) {
    return [];
  }
  return Array.isArray(selected) ? selected : [selected];
};

export const chooseSavePath = (suggestedName: string): Promise<string | null> =>
  save({ defaultPath: suggestedName });

export const confirmLargeFile = (path: string, size: number): Promise<boolean> =>
  ask(
    `${path} is ${(size / (1024 * 1024)).toFixed(1)} MiB. Opening it may disable advanced editor features. Continue?`,
    { title: 'Open large file', kind: 'warning' }
  );

export const confirmOverwrite = (path: string): Promise<boolean> =>
  ask(
    `${path} changed on disk. Overwrite the currently observed disk version with your editor version? This cannot be undone.`,
    { title: 'Overwrite changed file?', kind: 'warning' }
  );

export type FileDropSubscription = (paths: readonly string[]) => void | Promise<void>;

export const subscribeToFileDrops = async (onDrop: FileDropSubscription): Promise<() => void> => {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return () => undefined;
  }
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'drop') {
      void onDrop(event.payload.paths);
    }
  });
};
