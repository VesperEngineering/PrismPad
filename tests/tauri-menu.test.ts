import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('defines only stable application command ids in native menus', () => {
  const source = readFileSync('src-tauri/src/lib.rs', 'utf8');
  for (const id of ['file.new', 'file.open', 'file.save', 'file.saveAs', 'file.close', 'edit.find', 'edit.replace', 'view.wrap', 'view.markdownPreview', 'view.zoomIn', 'view.zoomOut', 'view.theme']) {
    expect(source).toContain(`"${id}"`);
  }
  expect(source).toContain('prismpad://command');
  expect(source).toContain('for (id, item) in [');
  expect(source).not.toContain('item.id().to_string()');
  expect(source).toContain('NamedTempFile::new_in(&canonical_current_dir)');
  expect(source).toContain('strip_prefix(&canonical_current_dir)');
  expect(source).not.toContain('create_dir(&detour)');
});
