import type { LanguageId } from './languages';

export type LineEnding = 'lf' | 'crlf';
export type TextEncoding = 'utf-8';

export type DiskMetadata = Readonly<{
  path: string;
  modifiedMs: number;
  size: number;
  /** Opaque SHA-256 revision supplied by the native file boundary. */
  revision: string;
}>;

export type OpenFilePayload = DiskMetadata &
  Readonly<{
    text: string;
    encoding: TextEncoding;
    bom: boolean;
    lineEnding: LineEnding;
    large: boolean;
  }>;

export type DocumentRecord = Readonly<{
  id: string;
  title: string;
  path: string | null;
  text: string;
  savedText: string;
  language: LanguageId;
  encoding: TextEncoding;
  bom: boolean;
  lineEnding: LineEnding;
  modifiedMs: number | null;
  size: number;
  revision: string | null;
  /** Latest externally observed metadata. It does not replace the save baseline. */
  observedDisk?: DiskMetadata | null;
  dirty: boolean;
  anchor: number;
  head: number;
}>;

export type DocumentSnapshot = Readonly<{
  documents: readonly DocumentRecord[];
  activeId: string | null;
}>;

export type DocumentStore = Readonly<{
  snapshot(): DocumentSnapshot;
  get(id: string): DocumentRecord | undefined;
  createUntitled(language: LanguageId): string;
  openPath(payload: OpenFilePayload): string;
  applyEdit(id: string, text: string): void;
  setSelection(id: string, anchor: number, head: number): void;
  markSaved(id: string, metadata: DiskMetadata, writtenText: string): void;
  replaceFromDisk(id: string, file: OpenFilePayload): void;
  observeDisk(id: string, metadata: DiskMetadata): void;
  activate(id: string): void;
  reorder(sourceId: string, targetId: string): void;
  remove(id: string): void;
}>;
