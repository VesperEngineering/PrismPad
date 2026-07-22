import { invoke } from '@tauri-apps/api/core';
import type { DiskMetadata, LineEnding, OpenFilePayload } from '../domain/document';

export type WriteFileRequest = Readonly<{
  path: string;
  text: string;
  bom: boolean;
  lineEnding: LineEnding;
  expectedModifiedMs: number | null;
  expectedSize: number | null;
  /** Null is valid only for a target that does not yet exist. */
  expectedRevision: string | null;
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
