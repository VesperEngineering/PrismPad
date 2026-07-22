import { describe, expect, it, vi } from 'vitest';
import { createCommandController, STABLE_COMMAND_IDS, type CommandDeps } from '../src/lib/controllers/commands';

const dependencies = (overrides: Partial<CommandDeps> = {}): CommandDeps => ({
  activeId: () => 'active-id',
  newDocument: vi.fn(),
  openDialog: vi.fn(async () => undefined),
  save: vi.fn(async () => undefined),
  saveAs: vi.fn(async () => undefined),
  closeActive: vi.fn(async () => undefined),
  openFind: vi.fn(),
  openReplace: vi.fn(),
  toggleWrap: vi.fn(),
  toggleMarkdownPreview: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  cycleTheme: vi.fn(),
  isBusy: () => false,
  hasActiveModal: () => false,
  isMarkdown: () => true,
  fontSize: () => 14,
  ...overrides
});

describe('command controller', () => {
  it('routes Save As through its stable command id without IDE commands', async () => {
    const saveAs = vi.fn(async () => undefined);
    const controller = createCommandController(dependencies({ saveAs }));

    await expect(controller.execute('file.saveAs')).resolves.toBe(true);

    expect(saveAs).toHaveBeenCalledWith('active-id');
    expect(controller.ids).toEqual(STABLE_COMMAND_IDS);
    expect(controller.ids).not.toContain('view.commandPalette');
  });

  it('handles each browser shortcut once and only prevents the browser when it routes a command', async () => {
    const save = vi.fn(async () => undefined);
    const controller = createCommandController(dependencies({ save }));
    const handled = await controller.handleShortcut({ key: 's', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false });

    expect(handled).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    await expect(controller.handleShortcut({ key: 'q', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).resolves.toBe(false);
  });

  it('reports unavailable document commands as unhandled when there is no active document', async () => {
    const save = vi.fn(async () => undefined);
    const controller = createCommandController(dependencies({ activeId: () => null, save }));

    await expect(controller.execute('file.save')).resolves.toBe(false);

    expect(save).not.toHaveBeenCalled();
  });

  it('centralizes availability for modals, Markdown preview, and zoom limits', async () => {
    const controller = createCommandController(dependencies({
      hasActiveModal: () => true,
      isMarkdown: () => false,
      fontSize: () => 32
    }));

    expect(controller.canExecute('file.new')).toBe(false);
    expect(controller.canExecute('view.markdownPreview')).toBe(false);
    expect(controller.canExecute('view.zoomIn')).toBe(false);
    await expect(controller.handleShortcut({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).resolves.toBe(false);
  });

  it('uses only exact Alt+Z for word wrap', async () => {
    const toggleWrap = vi.fn();
    const controller = createCommandController(dependencies({ toggleWrap }));
    await expect(controller.handleShortcut({ key: 'z', altKey: true, ctrlKey: false, metaKey: false, shiftKey: true })).resolves.toBe(false);
    expect(toggleWrap).not.toHaveBeenCalled();
  });
});
