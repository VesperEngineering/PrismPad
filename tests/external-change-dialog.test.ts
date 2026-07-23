import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import ExternalChangeDialog from '../src/lib/components/ExternalChangeDialog.svelte';
import DiffView from '../src/lib/components/DiffView.svelte';

const change = {
  documentId: 'a',
  path: '/tmp/a.txt',
  editorText: 'editor\n',
  source: {
    id: 'a', path: '/tmp/a.txt', text: 'editor\n', dirty: true,
    modifiedMs: 1, size: 1, revision: 'source'
  },
  disk: {
    path: '/tmp/a.txt', text: 'disk\n', encoding: 'utf-8' as const, bom: false,
    lineEnding: 'lf' as const, modifiedMs: 2, size: 5, revision: 'disk', large: false
  }
};

it('offers explicit external-change decisions and keeps the editor version only on request', async () => {
  const onReload = vi.fn();
  const onCompare = vi.fn();
  const onKeep = vi.fn();
  render(ExternalChangeDialog, { change, onReload, onCompare, onKeep, onDismiss: vi.fn() });

  await fireEvent.click(screen.getByRole('button', { name: 'Keep Editor Version' }));

  expect(onKeep).toHaveBeenCalledOnce();
  expect(onReload).not.toHaveBeenCalled();
  expect(onCompare).not.toHaveBeenCalled();
});

it('dismisses the external change dialog with Escape without choosing a destructive action', async () => {
  const onDismiss = vi.fn();
  const onReload = vi.fn();
  render(ExternalChangeDialog, { change, onReload, onCompare: vi.fn(), onKeep: vi.fn(), onDismiss });

  await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

  expect(onDismiss).toHaveBeenCalledOnce();
  expect(onReload).not.toHaveBeenCalled();
});

it('disables all external-change decisions while a reload is pending', () => {
  render(ExternalChangeDialog, {
    change, busy: true, onReload: vi.fn(), onCompare: vi.fn(), onKeep: vi.fn(), onDismiss: vi.fn()
  });

  expect(screen.getByRole('button', { name: 'Reload From Disk' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Keep Editor Version' })).toBeDisabled();
});

it('opens the external change prompt as a native modal and restores focus when it closes', () => {
  const invoker = document.createElement('button');
  document.body.append(invoker);
  invoker.focus();
  const showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  const view = render(ExternalChangeDialog, {
    change, onReload: vi.fn(), onCompare: vi.fn(), onKeep: vi.fn(), onDismiss: vi.fn()
  });

  expect(screen.getByRole('dialog')).toHaveProperty('tagName', 'DIALOG');
  expect(showModal).toHaveBeenCalledOnce();
  view.unmount();
  expect(invoker).toHaveFocus();
  invoker.remove();
});

it('renders read-only disk and editor comparison and closing it does not choose either version', async () => {
  const onClose = vi.fn();
  render(DiffView, { diskText: 'disk\n', editorText: 'editor\n', onClose });

  expect(screen.getByRole('dialog', { name: 'Compare external change' })).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Compare external change' })).toHaveFocus();
  expect(screen.getByText('Disk version')).toBeInTheDocument();
  expect(screen.getByText('Editor version')).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('uses a native modal for the comparison and traps Tab at its boundaries', async () => {
  const showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  render(DiffView, { diskText: 'disk\n', editorText: 'editor\n', onClose: vi.fn() });
  const dialog = screen.getByRole('dialog', { name: 'Compare external change' });

  expect(dialog).toHaveProperty('tagName', 'DIALOG');
  expect(showModal).toHaveBeenCalledOnce();
  await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Close comparison' })).toHaveFocus();
});
