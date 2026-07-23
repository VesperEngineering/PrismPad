import { invoke } from '@tauri-apps/api/core';
import { STABLE_COMMAND_IDS, type CommandId } from '../controllers/commands';

export type MenuAvailability = Readonly<Record<CommandId, boolean>>;

const isTauriRuntime = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const syncNativeMenuAvailability = async (availability: MenuAvailability): Promise<void> => {
  if (!isTauriRuntime()) return;
  await invoke('update_menu_availability', {
    updates: STABLE_COMMAND_IDS.map((id) => ({ id, enabled: availability[id] }))
  });
};
