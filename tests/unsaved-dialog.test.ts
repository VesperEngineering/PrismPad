import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import UnsavedDialog from '../src/lib/components/UnsavedDialog.svelte';
import {
  closeDocument,
  createWindowLifecycle,
  resolveClose
} from '../src/lib/controllers/window-lifecycle';

describe('unsaved changes dialog', () => {
  it('lists each dirty document and returns individual save and discard choices', async () => {
    const onResolve = vi.fn();
    render(UnsavedDialog, {
      documents: [{ id: 'a', title: 'alpha.py' }, { id: 'b', title: 'beta.md' }],
      onResolve
    });

    expect(screen.getByText('alpha.py')).toBeInTheDocument();
    expect(screen.getByText('beta.md')).toBeInTheDocument();
    await fireEvent.change(screen.getByLabelText('beta.md decision'), { target: { value: 'discard' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onResolve).toHaveBeenCalledWith([{ id: 'a', action: 'save' }, { id: 'b', action: 'discard' }]);
  });

  it('cancels the complete close request', async () => {
    const onResolve = vi.fn();
    render(UnsavedDialog, { documents: [{ id: 'a', title: 'alpha.py' }], onResolve });

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onResolve).toHaveBeenCalledWith([{ id: 'a', action: 'cancel' }]);
    expect(resolveClose([{ id: 'a', action: 'save' }, { id: 'b', action: 'discard' }])).toBe(true);
    expect(resolveClose([{ id: 'a', action: 'cancel' }])).toBe(false);
  });

  it('does not close when a dirty document is missing a decision', async () => {
    const preventDefault = vi.fn();
    const save = vi.fn(async () => undefined);
    const persistSession = vi.fn(async () => undefined);
    const window = { onCloseRequested: vi.fn(), close: vi.fn(async () => undefined) };
    const snapshot = () => ({
      activeId: 'a',
      documents: [
        { id: 'a', title: 'alpha.py', dirty: true },
        { id: 'b', title: 'beta.md', dirty: true }
      ]
    });
    const lifecycle = createWindowLifecycle({
      snapshot,
      save,
      isDirty: () => false,
      remove: vi.fn(),
      requestDecisions: vi.fn(async () => [{ id: 'a', action: 'save' as const }]),
      persistSession,
      window,
      showError: vi.fn()
    });

    await lifecycle.onCloseRequested({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('aborts native close before any dirty-document flow while an external prompt is active', async () => {
    const requestDecisions = vi.fn();
    const persistSession = vi.fn();
    const window = { onCloseRequested: vi.fn(), close: vi.fn(async () => undefined) };
    const lifecycle = createWindowLifecycle({
      snapshot: () => ({ activeId: 'a', documents: [{ id: 'a', title: 'alpha.py', dirty: true }] }),
      save: vi.fn(async () => undefined), isDirty: () => true, remove: vi.fn(), requestDecisions,
      persistSession, window, isInteractionBlocked: () => true, showError: vi.fn()
    });

    await lifecycle.onCloseRequested({ preventDefault: vi.fn() });

    expect(requestDecisions).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('does not discard, save, or close when an external prompt appears during close decisions', async () => {
    let blocked = false;
    let dirty = true;
    const remove = vi.fn();
    const save = vi.fn();
    const lifecycle = createWindowLifecycle({
      snapshot: () => ({ activeId: 'a', documents: dirty ? [{ id: 'a', title: 'alpha.py', dirty: true }] : [] }),
      save, isDirty: () => dirty, remove: vi.fn(() => { dirty = false; }),
      requestDecisions: vi.fn(async () => { blocked = true; return [{ id: 'a', action: 'discard' as const }]; }),
      persistSession: vi.fn(), window: { onCloseRequested: vi.fn(), close: vi.fn() }, isInteractionBlocked: () => blocked, showError: vi.fn()
    });
    await lifecycle.onCloseRequested({ preventDefault: vi.fn() });
    expect(remove).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('opens a modal dialog, focuses its cancel action, and closes the modal on teardown', () => {
    const originalShowModal = HTMLDialogElement.prototype.showModal;
    const originalClose = HTMLDialogElement.prototype.close;
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    const close = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });

    const rendered = render(UnsavedDialog, { documents: [{ id: 'a', title: 'alpha.py' }], onResolve: vi.fn() });

    expect(showModal).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    rendered.unmount();
    expect(close).toHaveBeenCalledOnce();

    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: originalShowModal });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: originalClose });
  });

  it('re-prompts when a new dirty document appears before protected close persists the session', async () => {
    let saved = false;
    const requestDecisions = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a', action: 'save' as const }])
      .mockResolvedValueOnce([{ id: 'b', action: 'cancel' as const }]);
    const persistSession = vi.fn(async () => undefined);
    const window = { onCloseRequested: vi.fn(), close: vi.fn(async () => undefined) };
    const lifecycle = createWindowLifecycle({
      snapshot: () => ({
        activeId: 'a',
        documents: saved
          ? [{ id: 'a', title: 'alpha.py', dirty: false }, { id: 'b', title: 'beta.md', dirty: true }]
          : [{ id: 'a', title: 'alpha.py', dirty: true }]
      }),
      save: vi.fn(async () => { saved = true; }),
      isDirty: () => false,
      remove: vi.fn(),
      requestDecisions,
      persistSession,
      window,
      showError: vi.fn()
    });

    await lifecycle.onCloseRequested({ preventDefault: vi.fn() });

    expect(requestDecisions).toHaveBeenCalledTimes(2);
    expect(persistSession).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
  });

  it('only removes a dirty tab after its save decision leaves it clean', async () => {
    let dirty = true;
    const remove = vi.fn();
    await closeDocument({
      get: () => ({ id: 'a', title: 'alpha.py', dirty }),
      requestDecisions: vi.fn(async () => [{ id: 'a', action: 'save' as const }]),
      save: vi.fn(async () => undefined),
      isDirty: () => dirty,
      remove,
      showError: vi.fn()
    }, 'a');
    expect(remove).not.toHaveBeenCalled();

    dirty = false;
    await closeDocument({
      get: () => ({ id: 'a', title: 'alpha.py', dirty: true }),
      requestDecisions: vi.fn(async () => [{ id: 'a', action: 'save' as const }]),
      save: vi.fn(async () => undefined),
      isDirty: () => dirty,
      remove,
      showError: vi.fn()
    }, 'a');
    expect(remove).toHaveBeenCalledWith('a');
  });

  it('removes discarded documents before saving later documents in a window close', async () => {
    let documents = [
      { id: 'b', title: 'beta.md', dirty: true },
      { id: 'a', title: 'alpha.py', dirty: true }
    ];
    const remove = vi.fn((id: string) => {
      documents = documents.filter((document) => document.id !== id);
    });
    const save = vi.fn(async (id: string) => {
      documents = documents.map((document) => document.id === id ? { ...document, dirty: false } : document);
    });
    const lifecycle = createWindowLifecycle({
      snapshot: () => ({ activeId: 'b', documents }),
      save,
      isDirty: (id) => documents.find((document) => document.id === id)?.dirty ?? false,
      remove,
      requestDecisions: vi.fn(async () => [
        { id: 'a', action: 'discard' as const },
        { id: 'b', action: 'save' as const }
      ]),
      persistSession: vi.fn(async () => undefined),
      window: { onCloseRequested: vi.fn(), close: vi.fn(async () => undefined) },
      showError: vi.fn()
    });

    await lifecycle.onCloseRequested({ preventDefault: vi.fn() });

    expect(remove).toHaveBeenCalledWith('a');
    expect(save).toHaveBeenCalledWith('b');
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]);
    expect(documents).toEqual([{ id: 'b', title: 'beta.md', dirty: false }]);
  });

  it('re-prompts instead of closing when a document becomes dirty while persisting', async () => {
    let dirty = false;
    const requestDecisions = vi.fn(async () => [{ id: 'a', action: 'cancel' as const }]);
    const persistSession = vi.fn(async () => { dirty = true; });
    const window = { onCloseRequested: vi.fn(), close: vi.fn(async () => undefined) };
    const lifecycle = createWindowLifecycle({
      snapshot: () => ({ activeId: 'a', documents: [{ id: 'a', title: 'alpha.py', dirty }] }),
      save: vi.fn(async () => undefined),
      isDirty: () => dirty,
      remove: vi.fn(),
      requestDecisions,
      persistSession,
      window,
      showError: vi.fn()
    });

    await lifecycle.onCloseRequested({ preventDefault: vi.fn() });

    expect(persistSession).toHaveBeenCalledOnce();
    expect(requestDecisions).toHaveBeenCalledWith([{ id: 'a', title: 'alpha.py', dirty: true }]);
    expect(window.close).not.toHaveBeenCalled();
  });
});
