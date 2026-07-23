import { LazyStore } from '@tauri-apps/plugin-store';
import type { OpenFilePayload } from '../domain/document';
import {
  validatePreferences,
  validatePreferencesWithStatus,
  type PreferenceValidation,
  type Preferences
} from '../stores/preferences.svelte';

export type SessionTab = Readonly<{ path: string; anchor: number; head: number }>;
export type SessionV1 = Readonly<{
  version: 1;
  activePath: string | null;
  tabs: readonly SessionTab[];
}>;

export type SessionSnapshot = Readonly<{
  activeId: string | null;
  documents: readonly (Readonly<{
    id: string;
    path: string | null;
    anchor: number;
    head: number;
  }> & Record<string, unknown>)[];
}>;

export type SessionRestore = Readonly<{
  activePath: string | null;
  files: readonly Readonly<{ file: OpenFilePayload; anchor: number; head: number }>[];
  skipped: readonly string[];
}>;

type PersistedStore = Pick<LazyStore, 'get' | 'set' | 'save'>;
type StoreFactory = (path: string) => PersistedStore;

const PREFERENCES_PATH = 'preferences.json';
const SESSION_PATH = 'session.json';
const PREFERENCES_KEY = 'preferences';
const SESSION_KEY = 'session';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const nativeStore: StoreFactory = (path) => new LazyStore(path, { autoSave: false });

const safeInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;

const toSessionTab = (value: unknown): SessionTab | undefined => {
  if (!isRecord(value) || typeof value.path !== 'string' || !value.path) {
    return undefined;
  }
  const anchor = safeInteger(value.anchor);
  const head = safeInteger(value.head);
  return anchor === undefined || head === undefined ? undefined : { path: value.path, anchor, head };
};

export const validateSession = (value: unknown): SessionV1 | null => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tabs)) {
    return null;
  }
  const tabs = value.tabs.map(toSessionTab).filter((tab): tab is SessionTab => tab !== undefined);
  const paths = new Set<string>();
  const uniqueTabs = tabs.filter((tab) => !paths.has(tab.path) && (paths.add(tab.path) || true));
  const activePath = typeof value.activePath === 'string' && paths.has(value.activePath) ? value.activePath : null;
  return { version: 1, activePath, tabs: uniqueTabs };
};

export const serializeSession = (snapshot: SessionSnapshot): SessionV1 => {
  const tabs = snapshot.documents.flatMap((document): SessionTab[] => {
    if (!document.path) {
      return [];
    }
    return [{
      path: document.path,
      anchor: safeInteger(document.anchor) ?? 0,
      head: safeInteger(document.head) ?? 0
    }];
  });
  const activePath = snapshot.documents.find((document) => document.id === snapshot.activeId)?.path ?? null;
  return { version: 1, activePath, tabs };
};

export const restoreSession = async (
  session: SessionV1,
  readFile: (path: string, allowLarge: boolean) => Promise<OpenFilePayload>
): Promise<SessionRestore> => {
  const files: Array<{ file: OpenFilePayload; anchor: number; head: number }> = [];
  const skipped: string[] = [];
  for (const tab of session.tabs) {
    try {
      const file = await readFile(tab.path, false);
      files.push({ file, anchor: tab.anchor, head: tab.head });
    } catch {
      skipped.push(tab.path);
    }
  }
  return { activePath: session.activePath, files, skipped };
};

export const loadPreferences = async (factory: StoreFactory = nativeStore): Promise<Preferences> => {
  const result = await loadPreferencesWithStatus(factory);
  return result.preferences;
};

export const loadPreferencesWithStatus = async (
  factory: StoreFactory = nativeStore
): Promise<PreferenceValidation> => {
  if (!isTauriRuntime() && factory === nativeStore) {
    return validatePreferencesWithStatus(undefined);
  }
  const stored = await factory(PREFERENCES_PATH).get<unknown>(PREFERENCES_KEY);
  const isV1Wrapper = isRecord(stored) && stored.version === 1;
  const validV1Wrapper = isV1Wrapper && 'values' in stored && isRecord(stored.values);
  const payload = validV1Wrapper ? stored.values : stored;
  const validation = validatePreferencesWithStatus(payload);
  return {
    ...validation,
    recovered: validation.recovered || isV1Wrapper && !validV1Wrapper ||
      (isRecord(stored) && 'version' in stored && stored.version !== 1)
  };
};

export const savePreferences = async (
  preferences: Preferences,
  factory: StoreFactory = nativeStore
): Promise<void> => {
  if (!isTauriRuntime() && factory === nativeStore) {
    return;
  }
  const store = factory(PREFERENCES_PATH);
  await store.set(PREFERENCES_KEY, { version: 1, values: validatePreferences(preferences) });
  await store.save();
};

export const loadSession = async (factory: StoreFactory = nativeStore): Promise<SessionV1 | null> => {
  if (!isTauriRuntime() && factory === nativeStore) {
    return null;
  }
  return validateSession(await factory(SESSION_PATH).get<unknown>(SESSION_KEY));
};

export const saveSession = async (
  snapshot: SessionSnapshot,
  factory: StoreFactory = nativeStore
): Promise<SessionV1> => {
  const session = serializeSession(snapshot);
  if (!isTauriRuntime() && factory === nativeStore) {
    return session;
  }
  const store = factory(SESSION_PATH);
  await store.set(SESSION_KEY, session);
  await store.save();
  return session;
};
