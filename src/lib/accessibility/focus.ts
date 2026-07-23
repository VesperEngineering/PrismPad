export type RovingKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export const moveRovingFocus = (index: number, count: number, key: RovingKey): number => {
  if (count <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return (index + (key === 'ArrowRight' ? 1 : -1) + count) % count;
};

export const focusElement = (element: HTMLElement | null | undefined): boolean => {
  if (!element) return false;
  element.focus();
  return true;
};

const channel = (hex: string): number => {
  const value = Number.parseInt(hex, 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (color: string): number => {
  const hex = color.replace('#', '');
  const [red, green, blue] = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map(channel);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

export const contrastRatio = (foreground: string, background: string): number => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};
