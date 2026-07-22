import type {
  DiskMetadata,
  DocumentRecord,
  DocumentSnapshot,
  DocumentStore,
  OpenFilePayload
} from '../domain/document';
import { languageForPath, type LanguageId } from '../domain/languages';

const UNTITLED_TITLE = 'Untitled';
const ID_FACTORY_RETRY_LIMIT = 8;

const isWindowsPath = (path: string): boolean =>
  /^[A-Za-z]:/.test(path) || path.startsWith('\\\\');

const titleForPath = (path: string): string =>
  path.split(isWindowsPath(path) ? /[\\/]/ : /\//).filter(Boolean).at(-1) ?? UNTITLED_TITLE;

const cloneDocument = (document: DocumentRecord): DocumentRecord => ({ ...document });

/**
 * Produces a lexical key for document identity. Native I/O is responsible for
 * resolving symlinks and handing canonical filesystem paths to this store.
 */
export const normalizeDocumentPath = (path: string): string => {
  const isWindows = isWindowsPath(path);
  const separators = isWindows ? path.replace(/\\/g, '/') : path;
  const drive = isWindows ? /^([A-Za-z]):(\/)?(.*)$/.exec(separators) : null;
  const root = drive ? `${drive[1]}:${drive[2] ?? ''}` : isWindows ? '//' : separators.startsWith('/') ? '/' : '';
  const remainder = drive
    ? drive[3]
    : root
      ? separators.replace(/^\/+/, '')
      : separators;
  const parts: string[] = [];

  for (const part of remainder.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      if (parts.length && parts.at(-1) !== '..') {
        parts.pop();
      } else if (!root) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }

  const body = parts.join('/');
  const normalized = drive
    ? `${root}${body}`
    : isWindows
      ? `//${body}`
      : root
        ? `/${body}`
        : body || (separators === '.' ? '.' : '');

  return isWindows ? normalized.toLowerCase() : normalized;
};

export const createDocumentStore = (
  idFactory: () => string = () => crypto.randomUUID()
): DocumentStore => {
  let documents: DocumentRecord[] = [];
  let activeId: string | null = null;
  let nextFallbackId = 1;

  const indexFor = (id: string): number => documents.findIndex((document) => document.id === id);

  const nextId = (): string => {
    for (let attempt = 0; attempt < ID_FACTORY_RETRY_LIMIT; attempt += 1) {
      const id = idFactory();
      if (id && indexFor(id) === -1) {
        return id;
      }
    }

    let id: string;
    do {
      id = `document-${nextFallbackId}`;
      nextFallbackId += 1;
    } while (indexFor(id) !== -1);
    return id;
  };

  const nextUntitledTitle = (
    excludedIds: ReadonlySet<string> = new Set(),
    occupiedTitles: readonly string[] = []
  ): string => {
    const titles = new Set(
      documents
        .filter((document) => !excludedIds.has(document.id))
        .map((document) => document.title)
    );
    occupiedTitles.forEach((title) => titles.add(title));

    for (let suffix = 1; ; suffix += 1) {
      const title = suffix === 1 ? UNTITLED_TITLE : `${UNTITLED_TITLE} ${suffix}`;
      if (!titles.has(title)) {
        return title;
      }
    }
  };

  const indexForPath = (path: string, exceptId?: string): number => {
    const normalized = normalizeDocumentPath(path);
    return documents.findIndex(
      (document) =>
        document.id !== exceptId &&
        document.path !== null &&
        normalizeDocumentPath(document.path) === normalized
    );
  };

  const replace = (id: string, update: (document: DocumentRecord) => DocumentRecord): void => {
    const index = indexFor(id);
    if (index !== -1) {
      documents[index] = update(documents[index]);
    }
  };

  return {
    snapshot: (): DocumentSnapshot => ({
      documents: documents.map(cloneDocument),
      activeId
    }),

    get: (id: string): DocumentRecord | undefined => {
      const document = documents.find((candidate) => candidate.id === id);
      return document && cloneDocument(document);
    },

    createUntitled: (language: LanguageId): string => {
      const id = nextId();
      documents = [
        ...documents,
        {
          id,
          title: nextUntitledTitle(),
          path: null,
          text: '',
          savedText: '',
          language,
          encoding: 'utf-8',
          bom: false,
          lineEnding: 'lf',
          modifiedMs: null,
          size: 0,
          revision: null,
          dirty: false,
          anchor: 0,
          head: 0
        }
      ];
      activeId = id;
      return id;
    },

    openPath: (payload: OpenFilePayload): string => {
      const existingIndex = indexForPath(payload.path);
      if (existingIndex !== -1) {
        activeId = documents[existingIndex].id;
        return documents[existingIndex].id;
      }

      const id = nextId();
      documents = [
        ...documents,
        {
          id,
          title: titleForPath(payload.path),
          path: payload.path,
          text: payload.text,
          savedText: payload.text,
          language: languageForPath(payload.path).id,
          encoding: payload.encoding,
          bom: payload.bom,
          lineEnding: payload.lineEnding,
          modifiedMs: payload.modifiedMs,
          size: payload.size,
          revision: payload.revision,
          dirty: false,
          anchor: 0,
          head: 0
        }
      ];
      activeId = id;
      return id;
    },

    applyEdit: (id: string, text: string): void => {
      replace(id, (document) => ({
        ...document,
        text,
        dirty: text !== document.savedText
      }));
    },

    setSelection: (id: string, anchor: number, head: number): void => {
      replace(id, (document) => ({ ...document, anchor, head }));
    },

    markSaved: (id: string, metadata: DiskMetadata): void => {
      const sourceIndex = indexFor(id);
      if (sourceIndex === -1) {
        return;
      }

      const source = documents[sourceIndex];
      const savedDocument: DocumentRecord = {
        ...source,
        path: metadata.path,
        title: titleForPath(metadata.path),
        language: languageForPath(metadata.path).id,
        modifiedMs: metadata.modifiedMs,
        size: metadata.size,
        revision: metadata.revision,
        savedText: source.text,
        dirty: false
      };
      const duplicateIndex = indexForPath(metadata.path, id);
      const displaced = duplicateIndex === -1 ? undefined : documents[duplicateIndex];

      if (displaced && displaced.text !== displaced.savedText) {
        const recoveryDocument: DocumentRecord = {
          ...displaced,
          title: nextUntitledTitle(new Set([id, displaced.id]), [savedDocument.title]),
          path: null,
          modifiedMs: null,
          size: 0,
          revision: null,
          dirty: true
        };
        documents = documents.map((document) => {
          if (document.id === id) {
            return savedDocument;
          }
          return document.id === displaced.id ? recoveryDocument : document;
        });
      } else {
        documents = documents
          .map((document) => (document.id === id ? savedDocument : document))
          .filter((document) => document.id !== displaced?.id);
        if (activeId === displaced?.id) {
          activeId = id;
        }
      }
    },

    activate: (id: string): void => {
      if (indexFor(id) !== -1) {
        activeId = id;
      }
    },

    reorder: (sourceId: string, targetId: string): void => {
      const sourceIndex = indexFor(sourceId);
      const targetIndex = indexFor(targetId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return;
      }

      const [source] = documents.splice(sourceIndex, 1);
      const nextTargetIndex = indexFor(targetId);
      documents.splice(nextTargetIndex, 0, source);
      documents = [...documents];
    },

    remove: (id: string): void => {
      const index = indexFor(id);
      if (index === -1) {
        return;
      }

      documents.splice(index, 1);
      documents = [...documents];
      if (activeId === id) {
        activeId = documents[index]?.id ?? documents[index - 1]?.id ?? null;
      }
    }
  };
};
