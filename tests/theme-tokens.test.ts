import { readFileSync } from 'node:fs';

const luminance = (hex: string): number => {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((part) => parseInt(part, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex colour, received ${hex}`);
  }

  return channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
};

const contrastRatio = (foreground: string, background: string): number => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

it('keeps light-theme muted text readable on chrome and editor surfaces', () => {
  const css = readFileSync('src/app.css', 'utf8');
  const lightTheme = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  const muted = lightTheme.match(/--muted:\s*(#[a-f\d]{6})/i)?.[1];

  expect(muted).toBeDefined();
  expect(contrastRatio(muted!, '#ecebe7')).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(muted!, '#fffdf8')).toBeGreaterThanOrEqual(4.5);
});
