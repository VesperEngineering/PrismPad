import { expect, it } from 'vitest';
import { createDocumentStore } from '../src/lib/stores/documents.svelte';

const file = (text: string, revision: string) => ({
  path: '/tmp/a.txt', text, encoding: 'utf-8' as const, bom: false,
  lineEnding: 'lf' as const, modifiedMs: text.length, size: text.length, revision, large: false
});

it('keeps the expected save baseline after Keep Editor Version observes disk metadata', () => {
  const store = createDocumentStore(() => 'a');
  const id = store.openPath(file('opened\n', 'opened-revision'));
  store.applyEdit(id, 'editor\n');

  store.observeDisk(id, file('disk\n', 'disk-revision'));

  expect(store.get(id)).toMatchObject({
    text: 'editor\n', dirty: true, revision: 'opened-revision',
    observedDisk: { revision: 'disk-revision' }
  });
});

it('reload replaces text and all disk metadata while clearing the observed external change', () => {
  const store = createDocumentStore(() => 'a');
  const id = store.openPath(file('opened\n', 'opened-revision'));
  store.applyEdit(id, 'editor\n');
  store.observeDisk(id, file('disk\n', 'disk-revision'));

  store.replaceFromDisk(id, { ...file('fresh\r\n', 'fresh-revision'), bom: true, lineEnding: 'crlf' as const });

  expect(store.get(id)).toMatchObject({
    text: 'fresh\r\n', savedText: 'fresh\r\n', dirty: false, bom: true, lineEnding: 'crlf',
    revision: 'fresh-revision', observedDisk: null
  });
});
