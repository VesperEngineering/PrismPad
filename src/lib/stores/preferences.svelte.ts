export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export type Preferences = Readonly<{
  theme: ThemePreference;
  fontSize: number;
  wordWrap: boolean;
  tabWidth: 2 | 4 | 8;
  indentStyle: 'spaces' | 'tabs';
  indentationGuides: boolean;
  visibleWhitespace: boolean;
  autoReloadCleanFiles: boolean;
}>;

export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  theme: 'system',
  fontSize: 14,
  wordWrap: true,
  tabWidth: 4,
  indentStyle: 'spaces',
  indentationGuides: true,
  visibleWhitespace: false,
  autoReloadCleanFiles: true
});

export type PreferenceValidation = Readonly<{ preferences: Preferences; recovered: boolean }>;

type PreferenceRecord = Record<string, unknown>;
type ThemeMediaQuery = Pick<MediaQueryList, 'matches'> & Partial<Pick<MediaQueryList, 'addEventListener' | 'removeEventListener' | 'addListener' | 'removeListener'>>;
export type MatchMedia = (query: string) => ThemeMediaQuery;

const isRecord = (value: unknown): value is PreferenceRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTheme = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

const isFontSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 32;

const isTabWidth = (value: unknown): value is Preferences['tabWidth'] =>
  value === 2 || value === 4 || value === 8;

const isIndentStyle = (value: unknown): value is Preferences['indentStyle'] =>
  value === 'spaces' || value === 'tabs';

const hasInvalidStoredField = (input: PreferenceRecord): boolean =>
  ('theme' in input && !isTheme(input.theme)) ||
  ('fontSize' in input && !isFontSize(input.fontSize)) ||
  ('wordWrap' in input && typeof input.wordWrap !== 'boolean') ||
  ('tabWidth' in input && !isTabWidth(input.tabWidth)) ||
  ('indentStyle' in input && !isIndentStyle(input.indentStyle)) ||
  ('indentationGuides' in input && typeof input.indentationGuides !== 'boolean') ||
  ('visibleWhitespace' in input && typeof input.visibleWhitespace !== 'boolean') ||
  ('autoReloadCleanFiles' in input && typeof input.autoReloadCleanFiles !== 'boolean');

export const validatePreferencesWithStatus = (value: unknown): PreferenceValidation => {
  const input = isRecord(value) ? value : {};
  const preferences: Preferences = {
    theme: isTheme(input.theme) ? input.theme : DEFAULT_PREFERENCES.theme,
    fontSize: isFontSize(input.fontSize) ? input.fontSize : DEFAULT_PREFERENCES.fontSize,
    wordWrap: typeof input.wordWrap === 'boolean' ? input.wordWrap : DEFAULT_PREFERENCES.wordWrap,
    tabWidth: isTabWidth(input.tabWidth) ? input.tabWidth : DEFAULT_PREFERENCES.tabWidth,
    indentStyle: isIndentStyle(input.indentStyle) ? input.indentStyle : DEFAULT_PREFERENCES.indentStyle,
    indentationGuides: typeof input.indentationGuides === 'boolean'
      ? input.indentationGuides
      : DEFAULT_PREFERENCES.indentationGuides,
    visibleWhitespace: typeof input.visibleWhitespace === 'boolean'
      ? input.visibleWhitespace
      : DEFAULT_PREFERENCES.visibleWhitespace,
    autoReloadCleanFiles: typeof input.autoReloadCleanFiles === 'boolean'
      ? input.autoReloadCleanFiles
      : DEFAULT_PREFERENCES.autoReloadCleanFiles
  };
  return { preferences, recovered: !isRecord(value) ? value !== undefined : hasInvalidStoredField(input) };
};

export const validatePreferences = (value: unknown): Preferences =>
  validatePreferencesWithStatus(value).preferences;

const browserMatchMedia = (): MatchMedia | undefined =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : undefined;

export const resolveTheme = (
  preferences: Preferences,
  matchMedia: MatchMedia | undefined = browserMatchMedia()
): ResolvedTheme => {
  if (preferences.theme !== 'system') {
    return preferences.theme;
  }
  return matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Subscribes only while the system preference is active and always returns a cleanup function. */
export const subscribeToResolvedTheme = (
  preferences: Preferences,
  onChange: (theme: ResolvedTheme) => void,
  matchMedia: MatchMedia | undefined = browserMatchMedia()
): (() => void) => {
  const notify = (matches: boolean): void => onChange(matches ? 'dark' : 'light');
  if (preferences.theme !== 'system') {
    notify(preferences.theme === 'dark');
    return () => undefined;
  }

  const media = matchMedia?.('(prefers-color-scheme: dark)');
  notify(Boolean(media?.matches));
  if (!media) {
    return () => undefined;
  }

  const listener = (event: MediaQueryListEvent): void => notify(event.matches);
  if (media.addEventListener && media.removeEventListener) {
    media.addEventListener('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }
  if (media.addListener && media.removeListener) {
    media.addListener(listener);
    return () => media.removeListener?.(listener);
  }
  return () => undefined;
};
