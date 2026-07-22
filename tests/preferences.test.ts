import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  resolveTheme,
  subscribeToResolvedTheme,
  validatePreferences,
  validatePreferencesWithStatus
} from '../src/lib/stores/preferences.svelte';
import { loadPreferencesWithStatus } from '../src/lib/native/store-api';

describe('preferences', () => {
  it('falls back field-by-field when stored settings are corrupt', () => {
    expect(validatePreferences({ theme: 'laser', tabWidth: 0, wordWrap: false })).toEqual({
      theme: 'system',
      fontSize: 14,
      wordWrap: false,
      tabWidth: 4,
      indentStyle: 'spaces',
      indentationGuides: true,
      visibleWhitespace: false,
      autoReloadCleanFiles: true
    });
  });

  it('reports corruption while preserving independently valid stored settings', () => {
    expect(validatePreferencesWithStatus({ theme: 'dark', wordWrap: false, tabWidth: 3 })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark', wordWrap: false },
      recovered: true
    });
  });

  it.each([{ version: 1 }, { version: 1, values: 'not an object' }])(
    'reports a malformed version-1 store wrapper as recovered',
    async (stored) => {
      const store = {
        get: vi.fn(async () => stored),
        set: vi.fn(async () => undefined),
        save: vi.fn(async () => undefined)
      };

      await expect(loadPreferencesWithStatus((() => store) as never)).resolves.toEqual({
        preferences: DEFAULT_PREFERENCES,
        recovered: true
      });
    }
  );

  it('keeps independently valid settings when neighbouring fields are invalid', () => {
    expect(validatePreferences({
      theme: 'dark',
      fontSize: 18,
      tabWidth: 8,
      indentStyle: 'tabs',
      indentationGuides: false,
      visibleWhitespace: true,
      autoReloadCleanFiles: false,
      wordWrap: 'yes'
    })).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark', fontSize: 18, tabWidth: 8, indentStyle: 'tabs', indentationGuides: false, visibleWhitespace: true, autoReloadCleanFiles: false });
  });

  it('tracks system theme changes and removes its listener on teardown', () => {
    const listener = vi.fn();
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const stop = subscribeToResolvedTheme({ ...DEFAULT_PREFERENCES, theme: 'system' }, listener, () => media);

    expect(listener).toHaveBeenCalledWith('light');
    const change = media.addEventListener.mock.calls[0][1] as (event: MediaQueryListEvent) => void;
    change({ matches: true } as MediaQueryListEvent);
    expect(listener).toHaveBeenLastCalledWith('dark');
    stop();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', change);
  });

  it('uses the manual theme without subscribing to system changes', () => {
    const matchMedia = vi.fn(() => ({ matches: false } as MediaQueryList));
    const preferences = { ...DEFAULT_PREFERENCES, theme: 'dark' as const };
    expect(resolveTheme(preferences, matchMedia)).toBe('dark');
    subscribeToResolvedTheme(preferences, vi.fn(), matchMedia);
    expect(matchMedia).not.toHaveBeenCalled();
  });
});
