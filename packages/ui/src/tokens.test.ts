import { expect, test } from 'vitest';

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
  const normalized = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return (
    (normalized[0] ?? 0) * 0.2126 + (normalized[1] ?? 0) * 0.7152 + (normalized[2] ?? 0) * 0.0722
  );
}

function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

test('WCAG-adjusted primary action text reaches AA contrast', () => {
  expect(contrast('#ffffff', '#15803d')).toBeGreaterThanOrEqual(4.5);
});

test('WCAG-adjusted warning text reaches AA contrast', () => {
  expect(contrast('#9a3412', '#fff7ed')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#0f172a', '#fff7ed')).toBeGreaterThanOrEqual(4.5);
});

test('primary and secondary text tokens reach AA contrast on the app background', () => {
  expect(contrast('#0f172a', '#f8fafc')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#64748b', '#f8fafc')).toBeGreaterThanOrEqual(4.5);
});
