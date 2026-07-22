import { describe, expect, it, vi } from 'vitest';
import { createDocumentActions, type DocumentActionDeps } from '../src/lib/controllers/document-actions';
import { createDocumentStore } from '../src/lib/stores/documents.svelte';

const openPayload = (path: string) => ({
  path,
  text: 'print(1)\n',
  encoding: 'utf-8' as const,
  bom: false,
  lineEnding: 'lf' as const,
  modifiedMs: 4,
  size: 9,
  revision: 'opened-revision',
  large: false
});

const createDeps = (overrides: Partial<DocumentActionDeps> = {}) => {
  const documents = createDocumentStore(() => 'doc-1');
  const deps: DocumentActionDeps = {
    documents,
    chooseOpenPaths: vi.fn(async () => []),
    chooseSavePath: vi.fn(async () => null),
    readFile: vi.fn(async (path: string) => openPayload(path)),
    writeFile: vi.fn(async (request) => ({
      path: request.path,
      modifiedMs: 10,
      size: request.text.length,
      revision: 'saved-revision'
    })),
    confirmLargeFile: vi.fn(async () => true),
    showError: vi.fn(),
    ...overrides
  };
  return deps;
};

describe('document actions', () => {
  it('suggests the selected language suffix and updates path and syntax only after Save As succeeds', async () => {
    const deps = createDeps({ chooseSavePath: vi.fn(async () => '/tmp/tool.py') });
    const id = deps.documents.createUntitled('python');
    deps.documents.applyEdit(id, 'print(1)\n');

    await createDocumentActions(deps).saveAs(id);

    expect(deps.chooseSavePath).toHaveBeenCalledWith('Untitled.py');
    expect(deps.writeFile).toHaveBeenCalledWith({
      path: '/tmp/tool.py',
      text: 'print(1)\n',
      bom: false,
      lineEnding: 'lf',
      expectedModifiedMs: null,
      expectedSize: null,
      expectedRevision: null,
      overwriteExisting: true
    });
    expect(deps.documents.get(id)).toMatchObject({
      title: 'tool.py',
      path: '/tmp/tool.py',
      language: 'python',
      dirty: false,
      modifiedMs: 10,
      size: 9,
      revision: 'saved-revision'
    });
  });

  it('keeps a dirty untitled document unchanged after its save dialog is cancelled', async () => {
    const deps = createDeps();
    const id = deps.documents.createUntitled('markdown');
    deps.documents.applyEdit(id, '# Draft\n');

    await createDocumentActions(deps).save(id);

    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.documents.get(id)).toMatchObject({ path: null, language: 'markdown', dirty: true });
  });

  it('retries one large-file read after confirmation and opens the resulting document', async () => {
    const largeError = { code: 'large_file', message: 'Large file', size: 25 * 1024 * 1024 };
    const readFile = vi
      .fn()
      .mockRejectedValueOnce(largeError)
      .mockResolvedValueOnce(openPayload('/tmp/large.txt'));
    const deps = createDeps({ readFile, confirmLargeFile: vi.fn(async () => true) });

    await createDocumentActions(deps).openPaths(['/tmp/large.txt']);

    expect(deps.confirmLargeFile).toHaveBeenCalledWith('/tmp/large.txt', 25 * 1024 * 1024);
    expect(readFile).toHaveBeenNthCalledWith(1, '/tmp/large.txt', false);
    expect(readFile).toHaveBeenNthCalledWith(2, '/tmp/large.txt', true);
    expect(deps.documents.snapshot().documents).toHaveLength(1);
  });

  it('continues opening remaining paths after an error and reports the failed path', async () => {
    const deps = createDeps({
      readFile: vi.fn(async (path: string) => {
        if (path === '/tmp/bad.bin') {
          throw { code: 'binary', message: 'This appears to be a binary file.' };
        }
        return openPayload(path);
      })
    });

    await createDocumentActions(deps).openPaths(['/tmp/bad.bin', '/tmp/good.py']);

    expect(deps.showError).toHaveBeenCalledWith('Unable to open bad.bin: This appears to be a binary file.');
    expect(deps.documents.snapshot().documents).toMatchObject([{ path: '/tmp/good.py', language: 'python' }]);
  });

  it('preserves dirty conflict metadata and suppresses a duplicate save while a write is active', async () => {
    let rejectWrite: (reason: unknown) => void = () => undefined;
    const writeFile = vi.fn(
      () => new Promise<never>((_resolve, reject) => {
        rejectWrite = reject;
      })
    );
    const deps = createDeps({ writeFile });
    const id = deps.documents.openPath(openPayload('/tmp/tool.txt'));
    deps.documents.applyEdit(id, 'changed\n');
    const actions = createDocumentActions(deps);

    const firstSave = actions.save(id);
    const secondSave = actions.save(id);
    rejectWrite({ code: 'conflict', message: 'The file changed on disk after it was opened.' });
    await Promise.all([firstSave, secondSave]);

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({
      expectedModifiedMs: 4,
      expectedSize: 9,
      expectedRevision: 'opened-revision',
      overwriteExisting: false
    }));
    expect(deps.showError).toHaveBeenCalledWith(
      'Unable to save tool.txt: The file changed on disk after it was opened.'
    );
    expect(deps.documents.get(id)).toMatchObject({
      dirty: true,
      modifiedMs: 4,
      size: 9,
      revision: 'opened-revision'
    });
  });

  it('keeps edits made while a save is in flight and records the submitted text as saved', async () => {
    let resolveWrite: (metadata: { path: string; modifiedMs: number; size: number; revision: string }) => void =
      () => undefined;
    const writeFile = vi.fn(
      () => new Promise<{ path: string; modifiedMs: number; size: number; revision: string }>((resolve) => {
        resolveWrite = resolve;
      })
    );
    const deps = createDeps({ writeFile });
    const id = deps.documents.openPath(openPayload('/tmp/tool.txt'));
    deps.documents.applyEdit(id, 'submitted\n');
    deps.documents.setSelection(id, 4, 4);

    const saving = createDocumentActions(deps).save(id);
    deps.documents.applyEdit(id, 'edited after save began\n');
    deps.documents.setSelection(id, 8, 3);
    resolveWrite({ path: '/tmp/tool.txt', modifiedMs: 10, size: 10, revision: 'saved-revision' });
    await saving;

    expect(deps.documents.get(id)).toMatchObject({
      text: 'edited after save began\n',
      savedText: 'submitted\n',
      dirty: true,
      modifiedMs: 10,
      size: 10,
      revision: 'saved-revision',
      anchor: 8,
      head: 3
    });
  });

  it('opens one Save As chooser for concurrent direct requests and then writes once', async () => {
    let resolveChoose: (path: string | null) => void = () => undefined;
    const chooseSavePath = vi.fn(
      () => new Promise<string | null>((resolve) => {
        resolveChoose = resolve;
      })
    );
    const deps = createDeps({ chooseSavePath });
    const id = deps.documents.createUntitled('plain');
    deps.documents.applyEdit(id, 'draft\n');
    const actions = createDocumentActions(deps);

    const first = actions.saveAs(id);
    const second = actions.saveAs(id);
    expect(chooseSavePath).toHaveBeenCalledOnce();
    resolveChoose('/tmp/draft.txt');
    await Promise.all([first, second]);

    expect(deps.writeFile).toHaveBeenCalledTimes(1);
    expect(deps.writeFile).toHaveBeenCalledWith(expect.objectContaining({ overwriteExisting: true }));
  });
});
