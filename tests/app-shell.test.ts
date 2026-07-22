import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { vi } from 'vitest';

const externalEvents = vi.hoisted(() => ({ listener: undefined as ((path: string) => void) | undefined }));

vi.mock('../src/lib/native/file-api', () => ({
  chooseOpenPaths: vi.fn(async () => []),
  chooseSavePath: vi.fn(async () => null),
  confirmLargeFile: vi.fn(async () => true),
  confirmOverwrite: vi.fn(async () => false),
  openFile: vi.fn(),
  saveFile: vi.fn(),
  watchPath: vi.fn(async () => undefined),
  unwatchPath: vi.fn(async () => undefined),
  subscribeToExternalChanges: vi.fn(async (listener: (path: string) => void) => {
    externalEvents.listener = listener;
    return () => undefined;
  }),
  subscribeToFileDrops: vi.fn(async () => () => undefined)
}));

vi.mock('../src/lib/native/store-api', () => ({
  loadPreferencesWithStatus: vi.fn(async () => ({ preferences: {
    theme: 'system', fontSize: 14, wordWrap: true, tabWidth: 4, indentStyle: 'spaces',
    indentationGuides: true, visibleWhitespace: false, autoReloadCleanFiles: true
  }, recovered: false })),
  savePreferences: vi.fn(async () => undefined),
  loadSession: vi.fn(async () => null),
  saveSession: vi.fn(async () => undefined),
  restoreSession: vi.fn(async () => ({ activePath: null, files: [], skipped: [] }))
}));

import App from '../src/App.svelte';
import { chooseOpenPaths, openFile } from '../src/lib/native/file-api';
import { loadPreferencesWithStatus, loadSession, restoreSession } from '../src/lib/native/store-api';

it('renders the PrismPad shell and welcome experience without IDE panels', () => {
  render(App);
  expect(screen.getByRole('application', { name: 'PrismPad' })).toBeInTheDocument();
  expect(screen.getByText('Hello! What will you code in today?')).toBeInTheDocument();
  expect(screen.queryByText('Terminal')).not.toBeInTheDocument();
  expect(screen.queryByText('Explorer')).not.toBeInTheDocument();
});

it('replaces the welcome view with a connected document tab after language selection', async () => {
  render(App);

  await fireEvent.click(screen.getByRole('button', { name: 'Python' }));

  expect(screen.queryByText('Hello! What will you code in today?')).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Untitled/ })).toHaveAttribute('aria-selected', 'true');
});

it('switches the shell between the approved light and dark theme tokens', async () => {
  render(App);

  await fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }));

  expect(screen.getByRole('application', { name: 'PrismPad' })).toHaveAttribute('data-theme', 'dark');
  expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true');
});

it('applies persisted preferences when the shell starts', async () => {
  vi.mocked(loadPreferencesWithStatus).mockResolvedValueOnce({ preferences: {
    theme: 'dark', fontSize: 16, wordWrap: false, tabWidth: 2, indentStyle: 'tabs',
    indentationGuides: false, visibleWhitespace: true, autoReloadCleanFiles: false
  }, recovered: false });
  render(App);

  await waitFor(() => expect(screen.getByRole('application', { name: 'PrismPad' })).toHaveAttribute('data-theme', 'dark'));
});

it('shows session restore and recovered-preferences notices on the welcome screen', async () => {
  vi.mocked(loadPreferencesWithStatus).mockResolvedValueOnce({ preferences: {
    theme: 'system', fontSize: 14, wordWrap: true, tabWidth: 4, indentStyle: 'spaces',
    indentationGuides: true, visibleWhitespace: false, autoReloadCleanFiles: true
  }, recovered: true });
  vi.mocked(loadSession).mockResolvedValueOnce({ version: 1, activePath: null, tabs: [] });
  vi.mocked(restoreSession).mockResolvedValueOnce({ activePath: null, files: [], skipped: ['/tmp/missing.py'] });
  render(App);

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Some saved preferences were invalid'));
  expect(screen.getByRole('status')).toHaveTextContent('1 previously open file could not be restored.');
});

it('uses defaults and reports a non-blocking notice when preferences cannot load', async () => {
  vi.mocked(loadPreferencesWithStatus).mockRejectedValueOnce(new Error('corrupt store'));
  render(App);

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved preferences could not be loaded'));
  expect(screen.getByRole('application', { name: 'PrismPad' })).toHaveAttribute('data-theme', 'light');
});

it('uses the native open flow and scopes file keyboard shortcuts to the application shell', async () => {
  render(App);
  const app = screen.getByRole('application', { name: 'PrismPad' });

  await fireEvent.click(screen.getByRole('button', { name: /open existing file/i }));
  await waitFor(() => expect(chooseOpenPaths).toHaveBeenCalledOnce());

  await fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'n', ctrlKey: true });
  expect(screen.queryByRole('tab', { name: /Untitled/ })).not.toBeInTheDocument();

  await fireEvent.keyDown(app, { key: 'n', ctrlKey: true });
  expect(screen.getByRole('tab', { name: /Untitled/ })).toBeInTheDocument();
});

it('suppresses application shortcuts while an external-change decision is unresolved', async () => {
  vi.mocked(loadPreferencesWithStatus).mockResolvedValueOnce({ preferences: {
    theme: 'system', fontSize: 14, wordWrap: true, tabWidth: 4, indentStyle: 'spaces',
    indentationGuides: true, visibleWhitespace: false, autoReloadCleanFiles: false
  }, recovered: false });
  vi.mocked(chooseOpenPaths).mockResolvedValueOnce(['/tmp/external.txt']);
  vi.mocked(openFile)
    .mockResolvedValueOnce({ path: '/tmp/external.txt', text: 'opened\n', encoding: 'utf-8', bom: false, lineEnding: 'lf', modifiedMs: 1, size: 7, revision: 'opened', large: false })
    .mockResolvedValueOnce({ path: '/tmp/external.txt', text: 'disk\n', encoding: 'utf-8', bom: false, lineEnding: 'lf', modifiedMs: 2, size: 5, revision: 'disk', large: false });
  render(App);
  const app = screen.getByRole('application', { name: 'PrismPad' });

  await fireEvent.click(screen.getByRole('button', { name: /open existing file/i }));
  await waitFor(() => expect(screen.getByRole('tab', { name: /external.txt/ })).toBeInTheDocument());
  externalEvents.listener?.('/tmp/external.txt');
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

  await fireEvent.keyDown(app, { key: 'n', ctrlKey: true });

  expect(app.querySelectorAll('[role="tab"]')).toHaveLength(1);
});

it('routes visible menu actions and keyboard find entry through the application controller', async () => {
  render(App);
  const app = screen.getByRole('application', { name: 'PrismPad' });

  await fireEvent.click(screen.getByRole('button', { name: 'File' }));
  await fireEvent.click(screen.getByRole('menuitem', { name: 'New' }));
  expect(screen.getByRole('tab', { name: /Untitled/ })).toBeInTheDocument();

  await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'f', ctrlKey: true });
  expect(screen.getByRole('form', { name: 'Find' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Find text' })).toHaveFocus();
  expect(app.querySelector('.cm-search')).toBeNull();
});

it('does not intercept Find on the welcome screen', async () => {
  render(App);
  const app = screen.getByRole('application', { name: 'PrismPad' });
  const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
  app.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(screen.queryByRole('form', { name: 'Find' })).not.toBeInTheDocument();
});

it('uses roving keyboard focus in visible menus and restores the trigger on Escape', async () => {
  render(App);
  await fireEvent.click(screen.getByRole('button', { name: 'Plain Text' }));
  const file = screen.getByRole('button', { name: 'File' });
  await fireEvent.click(file);
  expect(screen.getByRole('menuitem', { name: 'New' })).toHaveFocus();
  await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'New' }), { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus();
  await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Open' }), { key: 'ArrowRight' });
  expect(screen.getByRole('menu', { name: 'Edit actions' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Find' })).toHaveFocus();
  await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Find' }), { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
});

it('cycles into Help and keeps a single menu tab stop', async () => {
  render(App);
  await fireEvent.click(screen.getByRole('button', { name: 'File' }));
  const fileItems = screen.getAllByRole('menuitem');
  expect(fileItems.filter((item) => item.getAttribute('tabindex') === '0')).toHaveLength(1);
  await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'New' }), { key: 'ArrowLeft' });
  expect(screen.getByRole('menu', { name: 'Help actions' })).toBeInTheDocument();
  await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'About PrismPad' }), { key: 'Tab' });
  expect(screen.queryByRole('menu', { name: 'Help actions' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Help' })).toHaveFocus();
});
