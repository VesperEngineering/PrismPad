export const STABLE_COMMAND_IDS = [
  'file.new', 'file.open', 'file.save', 'file.saveAs', 'file.close',
  'edit.find', 'edit.replace', 'view.wrap', 'view.markdownPreview',
  'view.zoomIn', 'view.zoomOut', 'view.theme'
] as const;

export type CommandId = typeof STABLE_COMMAND_IDS[number];

export type CommandDeps = Readonly<{
  activeId: () => string | null;
  newDocument: () => void;
  openDialog: () => Promise<void>;
  save: (id: string) => Promise<void>;
  saveAs: (id: string) => Promise<void>;
  closeActive: () => Promise<void>;
  openFind: () => void;
  openReplace: () => void;
  toggleWrap: () => void;
  toggleMarkdownPreview: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  cycleTheme: () => void;
  isBusy: () => boolean;
  hasActiveModal: () => boolean;
  isMarkdown: () => boolean;
  fontSize: () => number;
}>;

export type Shortcut = Readonly<Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>>;

const hasPrimaryModifier = (event: Shortcut): boolean => (event.ctrlKey || event.metaKey) && !event.altKey;

export const commandForShortcut = (event: Shortcut): CommandId | null => {
  const key = event.key.toLowerCase();
  if (hasPrimaryModifier(event)) {
    if (key === 'n' && !event.shiftKey) return 'file.new';
    if (key === 'o' && !event.shiftKey) return 'file.open';
    if (key === 's') return event.shiftKey ? 'file.saveAs' : 'file.save';
    if (key === 'w' && !event.shiftKey) return 'file.close';
    if (key === 'f' && !event.shiftKey) return 'edit.find';
    if (key === 'h' && !event.shiftKey) return 'edit.replace';
    if ((key === '=' || key === '+') && !event.shiftKey) return 'view.zoomIn';
    if (key === '-' && !event.shiftKey) return 'view.zoomOut';
    if (key === 'm' && event.shiftKey) return 'view.markdownPreview';
    if (key === 't' && event.shiftKey) return 'view.theme';
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'z') return 'view.wrap';
  return null;
};

export const isCommandId = (value: string): value is CommandId =>
  (STABLE_COMMAND_IDS as readonly string[]).includes(value);

export const createCommandController = (deps: CommandDeps) => {
  const canExecute = (id: CommandId): boolean => {
    if (deps.isBusy() || deps.hasActiveModal()) return false;
    if (['file.save', 'file.saveAs', 'file.close', 'edit.find', 'edit.replace'].includes(id) && !deps.activeId()) return false;
    if (id === 'view.markdownPreview') return deps.isMarkdown();
    if (id === 'view.zoomIn') return deps.fontSize() < 32;
    if (id === 'view.zoomOut') return deps.fontSize() > 10;
    return true;
  };

  const execute = async (id: CommandId): Promise<boolean> => {
    if (!canExecute(id)) return false;
    const activeId = deps.activeId();
    switch (id) {
      case 'file.new': deps.newDocument(); break;
      case 'file.open': await deps.openDialog(); break;
      case 'file.save': if (activeId) await deps.save(activeId); break;
      case 'file.saveAs': if (activeId) await deps.saveAs(activeId); break;
      case 'file.close': await deps.closeActive(); break;
      case 'edit.find': deps.openFind(); break;
      case 'edit.replace': deps.openReplace(); break;
      case 'view.wrap': deps.toggleWrap(); break;
      case 'view.markdownPreview': deps.toggleMarkdownPreview(); break;
      case 'view.zoomIn': deps.zoomIn(); break;
      case 'view.zoomOut': deps.zoomOut(); break;
      case 'view.theme': deps.cycleTheme(); break;
    }
    return true;
  };

  return {
    ids: STABLE_COMMAND_IDS,
    canExecute,
    execute,
    executeNative: async (id: string): Promise<boolean> => {
      if (!isCommandId(id)) return false;
      return execute(id);
    },
    handleShortcut: async (event: Shortcut): Promise<boolean> => {
      const id = commandForShortcut(event);
      if (!id) return false;
      return execute(id);
    }
  };
};
