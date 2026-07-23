import { createDocumentStore } from '../src/lib/stores/documents.svelte';

const openPayload = (path: string) => ({
  path,
  text: '# A\n',
  encoding: 'utf-8' as const,
  bom: false,
  lineEnding: 'lf' as const,
  modifiedMs: 1,
  size: 4,
  revision: 'opened-revision',
  large: false
});

it('retains the opaque native revision when opening and saving a document', () => {
  const store = createDocumentStore(() => 'fixed-id');
  const id = store.openPath(openPayload('/tmp/revision.txt'));

  expect(store.get(id)).toMatchObject({ revision: 'opened-revision' });

  store.markSaved(id, {
    path: '/tmp/revision.txt',
    modifiedMs: 2,
    size: 5,
    revision: 'saved-revision'
  }, '# A\n');

  expect(store.get(id)).toMatchObject({ revision: 'saved-revision' });
});

it('creates, edits, and saves an untitled document without losing identity', () => {
  const store = createDocumentStore(() => 'fixed-id');
  const id = store.createUntitled('python');

  store.applyEdit(id, 'print("hi")\n');
  expect(store.get(id)).toMatchObject({
    id,
    path: null,
    language: 'python',
    dirty: true
  });

  store.markSaved(id, { path: '/tmp/hello.py', modifiedMs: 10, size: 12, revision: 'hello-revision' }, 'print("hi")\n');
  expect(store.get(id)).toMatchObject({
    id,
    title: 'hello.py',
    path: '/tmp/hello.py',
    text: 'print("hi")\n',
    savedText: 'print("hi")\n',
    language: 'python',
    dirty: false,
    modifiedMs: 10,
    size: 12,
    revision: 'hello-revision'
  });
});

it('retains the latest cursor selection for each document', () => {
  const store = createDocumentStore(() => 'fixed-id');
  const id = store.createUntitled('plain');

  store.setSelection(id, 4, 2);

  expect(store.get(id)).toMatchObject({ anchor: 4, head: 2 });
});

it('opens a canonical path only once and activates its existing document', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);
  const payload = {
    path: '/tmp/a.md',
    text: '# A\n',
    encoding: 'utf-8' as const,
    bom: false,
    lineEnding: 'lf' as const,
    modifiedMs: 1,
    size: 4,
    revision: 'markdown-revision',
    large: false
  };

  const first = store.openPath(payload);
  store.createUntitled('plain');
  const second = store.openPath(payload);

  expect(second).toBe(first);
  expect(store.snapshot().activeId).toBe(first);
  expect(store.get(first)).toMatchObject({
    id: first,
    title: 'a.md',
    path: '/tmp/a.md',
    text: '# A\n',
    savedText: '# A\n',
    language: 'markdown',
    encoding: 'utf-8',
    bom: false,
    lineEnding: 'lf',
    modifiedMs: 1,
    size: 4,
    revision: 'markdown-revision',
    dirty: false,
    anchor: 0,
    head: 0
  });
  expect(store.snapshot().documents).toHaveLength(2);
});

it('activates, reorders, and removes documents while preserving the remaining order', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);
  const first = store.createUntitled('python');
  const second = store.createUntitled('json');
  const third = store.createUntitled('markdown');

  store.activate(first);
  store.reorder(third, first);
  store.remove(first);

  expect(store.snapshot()).toMatchObject({
    activeId: second,
    documents: [{ id: third }, { id: second }]
  });
});

it('returns cloned snapshots so callers cannot mutate document state', () => {
  const store = createDocumentStore(() => 'fixed-id');
  store.createUntitled('plain');
  const snapshot = store.snapshot();

  const mutableSnapshot = snapshot as unknown as {
    documents: Array<{ id: string; title: string }>;
  };
  mutableSnapshot.documents[0].title = 'changed outside the store';
  mutableSnapshot.documents.pop();

  expect(store.snapshot()).toMatchObject({
    documents: [{ id: 'fixed-id', title: 'Untitled' }]
  });
});

it('deduplicates lexical POSIX and Windows path aliases while preserving the first display path', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);

  const posix = store.openPath(openPayload('/tmp/project/./notes/../README.md'));
  expect(store.openPath(openPayload('/tmp/project/README.md'))).toBe(posix);

  const windows = store.openPath(openPayload('C:\\Work\\PrismPad\\src\\..\\README.MD'));
  expect(store.openPath(openPayload('c:/work/prismpad/README.md'))).toBe(windows);

  expect(store.snapshot().documents).toHaveLength(2);
  expect(store.get(posix)?.path).toBe('/tmp/project/./notes/../README.md');
  expect(store.get(windows)?.path).toBe('C:\\Work\\PrismPad\\src\\..\\README.MD');
});

it('merges a save-as target with its existing normalized-path document', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);
  const existing = store.openPath(openPayload('C:\\Work\\README.md'));
  const source = store.createUntitled('python');
  store.applyEdit(source, 'print("merged")\n');
  store.activate(existing);

  store.markSaved(source, {
    path: 'c:/work/./README.md',
    modifiedMs: 10,
    size: 16,
    revision: 'merged-revision'
  }, 'print("merged")\n');

  expect(store.snapshot()).toMatchObject({
    activeId: source,
    documents: [
      {
        id: source,
        path: 'c:/work/./README.md',
        title: 'README.md',
        language: 'markdown',
        text: 'print("merged")\n',
        savedText: 'print("merged")\n',
        dirty: false
      }
    ]
  });
  expect(store.get(existing)).toBeUndefined();
});

it('falls back from colliding ids and assigns reusable unique untitled titles', () => {
  const store = createDocumentStore(() => 'collision');
  const first = store.createUntitled('plain');
  const second = store.createUntitled('plain');
  const third = store.createUntitled('plain');

  expect(new Set([first, second, third]).size).toBe(3);
  expect(store.snapshot().documents.map((document) => document.title)).toEqual([
    'Untitled',
    'Untitled 2',
    'Untitled 3'
  ]);

  store.remove(second);
  const replacement = store.createUntitled('plain');

  expect(store.get(replacement)?.title).toBe('Untitled 2');
});

it('does not reuse an untitled title while a path-backed document claims it', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);
  store.createUntitled('plain');
  const released = store.createUntitled('plain');
  store.createUntitled('plain');
  store.remove(released);
  store.openPath(openPayload('/tmp/Untitled 2'));

  const next = store.createUntitled('plain');

  expect(store.get(next)?.title).toBe('Untitled 4');
});

it('retains dirty target edits as the active untitled recovery document after a save-as collision', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);
  store.createUntitled('plain');
  const target = store.openPath(openPayload('/tmp/README.md'));
  const source = store.createUntitled('python');
  store.applyEdit(target, '# locally edited\n');
  store.applyEdit(source, 'print("saved")\n');
  store.activate(target);

  store.markSaved(source, {
    path: '/tmp/README.md',
    modifiedMs: 10,
    size: 15,
    revision: 'saved-revision'
  }, 'print("saved")\n');

  expect(store.snapshot().activeId).toBe(target);
  expect(store.get(source)).toMatchObject({
    path: '/tmp/README.md',
    text: 'print("saved")\n',
    savedText: 'print("saved")\n',
    dirty: false
  });
  expect(store.get(target)).toMatchObject({
    path: null,
    title: 'Untitled 2',
    text: '# locally edited\n',
    savedText: '# A\n',
    dirty: true
  });
  expect(store.snapshot().documents.filter((document) => document.path !== null)).toHaveLength(1);
});

it('preserves Linux backslashes as filename characters and treats duplicate leading slashes as POSIX', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);

  const literalBackslash = store.openPath(openPayload('/tmp/a\\b.md'));
  const separator = store.openPath(openPayload('/tmp/a/b.md'));
  const upper = store.openPath(openPayload('//tmp/Foo'));
  const sameUpper = store.openPath(openPayload('/tmp/Foo'));
  const lower = store.openPath(openPayload('//tmp/foo'));

  expect(separator).not.toBe(literalBackslash);
  expect(sameUpper).toBe(upper);
  expect(lower).not.toBe(upper);
  expect(store.snapshot().documents).toHaveLength(4);
});

it('reserves the saved title when allocating a dirty collision recovery title', () => {
  let nextId = 0;
  const store = createDocumentStore(() => `doc-${++nextId}`);
  const target = store.openPath(openPayload('/tmp/Untitled'));
  const source = store.createUntitled('python');
  store.applyEdit(target, 'target edit\n');
  store.applyEdit(source, 'source save\n');

  store.markSaved(source, {
    path: '/tmp/Untitled',
    modifiedMs: 10,
    size: 12,
    revision: 'saved-revision'
  }, 'source save\n');

  expect(store.get(source)?.title).toBe('Untitled');
  expect(store.get(target)).toMatchObject({ path: null, title: 'Untitled 2', dirty: true });
  expect(new Set(store.snapshot().documents.map((document) => document.title)).size).toBe(2);
});
