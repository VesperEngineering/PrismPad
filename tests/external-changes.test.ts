import { describe, expect, it, vi } from 'vitest';
import type { OpenFilePayload } from '../src/lib/domain/document';
import {
  createExternalChangeController,
  type ExternalChangeDeps,
  type ExternalChangePrompt
} from '../src/lib/controllers/external-changes';
import { createExternalPromptQueue, type ExternalPromptQueueState } from '../src/lib/controllers/external-prompt-queue';

const diskFile = (text = 'disk\n', revision = `revision-${text}`): OpenFilePayload => ({
  path: '/tmp/a.txt',
  text,
  encoding: 'utf-8',
  bom: false,
  lineEnding: 'lf',
  modifiedMs: text.length,
  size: text.length,
  revision,
  large: false
});

function fakeExternalDeps(options: {
  dirty?: boolean;
  autoReloadCleanFiles?: boolean;
  readFile?: (path: string) => Promise<OpenFilePayload>;
} = {}): ExternalChangeDeps & { prompts: ExternalChangePrompt[]; document: {
  id: string; path: string; text: string; dirty: boolean; modifiedMs: number | null; size: number; revision: string | null;
} } {
  const document = {
    id: 'a', path: '/tmp/a.txt', dirty: options.dirty ?? false,
    modifiedMs: 1, size: 1, revision: 'original-revision', text: 'editor\n'
  };
  const prompts: ExternalChangePrompt[] = [];
  return {
    findDocumentByPath: vi.fn(() => document),
    autoReloadCleanFiles: () => options.autoReloadCleanFiles ?? true,
    readFile: vi.fn(options.readFile ?? (async () => diskFile())),
    replaceFromDisk: vi.fn(),
    observeDisk: vi.fn(),
    prompt: vi.fn((change) => prompts.push(change)),
    notify: vi.fn(),
    prompts,
    invalidatePrompts: vi.fn(),
    isPromptCurrent: vi.fn(() => true),
    document
  };
}

describe('external change controller', () => {
  it('auto-reloads a clean file when enabled', async () => {
    const deps = fakeExternalDeps();

    await createExternalChangeController(deps).onChanged('/tmp/a.txt');

    expect(deps.replaceFromDisk).toHaveBeenCalledWith('a', expect.objectContaining({ text: 'disk\n' }));
    expect(deps.prompt).not.toHaveBeenCalled();
  });

  it('prompts rather than auto-reloading a clean file when automatic reload is disabled', async () => {
    const deps = fakeExternalDeps({ autoReloadCleanFiles: false });

    await createExternalChangeController(deps).onChanged('/tmp/a.txt');

    expect(deps.prompt).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a', path: '/tmp/a.txt' }));
    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
  });

  it('prompts instead of overwriting a dirty editor', async () => {
    const deps = fakeExternalDeps({ dirty: true });

    await createExternalChangeController(deps).onChanged('/tmp/a.txt');

    expect(deps.prompt).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a', editorText: 'editor\n' }));
    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
  });

  it('coalesces duplicate events for the same unacknowledged disk revision into one prompt', async () => {
    const deps = fakeExternalDeps({ dirty: true });
    const controller = createExternalChangeController(deps);

    await controller.onChanged('/tmp/a.txt');
    await controller.onChanged('/tmp/a.txt');

    expect(deps.prompt).toHaveBeenCalledTimes(1);
  });

  it('preserves editor contents and reports an unreadable or deleted file', async () => {
    const deps = fakeExternalDeps({ readFile: async () => { throw new Error('not found'); } });

    await createExternalChangeController(deps).onChanged('/tmp/a.txt');

    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.prompt).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining('kept open'));
  });

  it('serializes duplicate events so an older read cannot replace the newest disk contents', async () => {
    let finishFirst: (file: OpenFilePayload) => void = () => undefined;
    const first = new Promise<OpenFilePayload>((resolve) => { finishFirst = resolve; });
    const deps = fakeExternalDeps({
      readFile: vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(diskFile('newest\n'))
    });
    const controller = createExternalChangeController(deps);

    const older = controller.onChanged('/tmp/a.txt');
    const newer = controller.onChanged('/tmp/a.txt');
    finishFirst(diskFile('older\n'));
    await Promise.all([older, newer]);

    expect(deps.replaceFromDisk).toHaveBeenLastCalledWith('a', expect.objectContaining({ text: 'newest\n' }));
  });

  it('ignores a save-generated event when its disk revision is the current save baseline', async () => {
    const deps = fakeExternalDeps({ readFile: async () => diskFile('editor\n', 'original-revision') });

    await createExternalChangeController(deps).onChanged('/tmp/a.txt');

    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.prompt).not.toHaveBeenCalled();
  });

  it('reloads only the still-open document after an asynchronous read', async () => {
    let resolveRead: (file: OpenFilePayload) => void = () => undefined;
    const pending = new Promise<OpenFilePayload>((resolve) => { resolveRead = resolve; });
    const deps = fakeExternalDeps({ readFile: async () => pending });
    const controller = createExternalChangeController(deps);
    const changed = controller.onChanged('/tmp/a.txt');
    (deps.findDocumentByPath as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    resolveRead(diskFile());

    await changed;

    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.prompt).not.toHaveBeenCalled();
  });

  it('never applies a stale read after the document has saved a newer revision', async () => {
    let resolveRead: (file: OpenFilePayload) => void = () => undefined;
    const pending = new Promise<OpenFilePayload>((resolve) => { resolveRead = resolve; });
    const deps = fakeExternalDeps({ readFile: async () => pending });
    const controller = createExternalChangeController(deps);
    const changed = controller.onChanged('/tmp/a.txt');
    const current = deps.findDocumentByPath('/tmp/a.txt') as unknown as {
      revision: string; modifiedMs: number; size: number; text: string; dirty: boolean;
    };
    current.revision = 'saved-r2';
    current.modifiedMs = 2;
    current.size = 3;
    current.text = 'saved r2\n';
    resolveRead(diskFile('stale r1\n', 'disk-r1'));

    await changed;

    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.prompt).not.toHaveBeenCalled();
  });

  it('keeps an external disk observation without changing the save conflict baseline', () => {
    const deps = fakeExternalDeps({ dirty: true });
    const controller = createExternalChangeController(deps);
    const change: ExternalChangePrompt = {
      documentId: 'a', path: '/tmp/a.txt', editorText: 'editor\n', disk: diskFile('disk\n'),
      source: { ...deps.document }
    };

    controller.keepEditorVersion(change);

    expect(deps.observeDisk).toHaveBeenCalledWith('a', expect.objectContaining({ revision: 'revision-disk\n' }));
    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
  });

  it('reload and compare decisions do not mutate state until reload is explicitly chosen', async () => {
    const deps = fakeExternalDeps({ dirty: true });
    const controller = createExternalChangeController(deps);
    const change: ExternalChangePrompt = {
      documentId: 'a', path: '/tmp/a.txt', editorText: 'editor\n', disk: diskFile('disk\n'),
      source: { ...deps.document }
    };

    await controller.reload(change);

    expect(deps.replaceFromDisk).toHaveBeenCalledWith('a', change.disk);
  });

  it('does not reload a cached prompt after the file becomes unreadable or deleted', async () => {
    const deps = fakeExternalDeps({ dirty: true });
    const controller = createExternalChangeController(deps);
    await controller.onChanged('/tmp/a.txt');
    const prompt = deps.prompts[0]!;
    (deps.readFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('deleted'));

    await expect(controller.reload(prompt)).resolves.toBe(false);

    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.document).toMatchObject({ text: 'editor\n', dirty: true });
    expect(deps.invalidatePrompts).toHaveBeenCalledWith('/tmp/a.txt');
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining('kept open'));
  });

  it('invalidates a prompt when saving changes its captured disk baseline', async () => {
    const deps = fakeExternalDeps({ dirty: true });
    const controller = createExternalChangeController(deps);
    await controller.onChanged('/tmp/a.txt');
    const prompt = deps.prompts[0]!;
    deps.document.revision = 'saved-r2';
    deps.document.modifiedMs = 2;
    deps.document.size = 2;

    await expect(controller.reload(prompt)).resolves.toBe(false);

    expect(deps.readFile).toHaveBeenCalledTimes(1);
    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.invalidatePrompts).toHaveBeenCalledWith('/tmp/a.txt', prompt);
  });

  it('preserves editor text when it changes during the decision-time reload read', async () => {
    let finishRead: (file: OpenFilePayload) => void = () => undefined;
    const pendingRead = new Promise<OpenFilePayload>((resolve) => { finishRead = resolve; });
    const deps = fakeExternalDeps({ dirty: true });
    const controller = createExternalChangeController(deps);
    await controller.onChanged('/tmp/a.txt');
    const prompt = deps.prompts[0]!;
    (deps.readFile as ReturnType<typeof vi.fn>).mockReturnValueOnce(pendingRead);

    const reloading = controller.reload(prompt);
    deps.document.text = 'edited during reload\n';
    finishRead(diskFile('disk after read\n'));

    await expect(reloading).resolves.toBe(false);
    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.document.text).toBe('edited during reload\n');
    expect(deps.invalidatePrompts).toHaveBeenCalledWith('/tmp/a.txt', prompt);
  });

  it('does not apply an older reload after a newer same-path prompt replaces it', async () => {
    let finishRead: (file: OpenFilePayload) => void = () => undefined;
    const pendingRead = new Promise<OpenFilePayload>((resolve) => { finishRead = resolve; });
    const deps = fakeExternalDeps({ dirty: true });
    const controller = createExternalChangeController(deps);
    await controller.onChanged('/tmp/a.txt');
    const older = deps.prompts[0]!;
    const newer: ExternalChangePrompt = { ...older, disk: diskFile('newer disk\n', 'disk-r3') };
    let state: ExternalPromptQueueState | null = null;
    const queue = createExternalPromptQueue({ onChange: (next) => (state = next) });
    queue.enqueue(older);
    (deps.isPromptCurrent as ReturnType<typeof vi.fn>).mockImplementation(queue.isCurrent);
    (deps.invalidatePrompts as ReturnType<typeof vi.fn>).mockImplementation(queue.invalidatePath);
    (deps.readFile as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(pendingRead)
      .mockResolvedValueOnce(newer.disk);

    const oldReload = controller.reload(older);
    queue.enqueue(newer);
    finishRead(diskFile('old disk\n', 'disk-r2'));

    await expect(oldReload).resolves.toBe(false);
    expect(deps.replaceFromDisk).not.toHaveBeenCalled();
    expect(deps.document).toMatchObject({ text: 'editor\n', dirty: true });
    expect(state).toEqual({ current: newer, comparing: false });

    await expect(controller.reload(newer)).resolves.toBe(true);
    expect(deps.replaceFromDisk).toHaveBeenCalledWith('a', newer.disk);
  });
});
