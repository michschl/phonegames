/* Numbers as people type and read them in Switzerland: 4'478, 4 478, 1,5 … */

/** Accepts "4'478", "4 478", "4.478,5", "1,5" … */
export function parseEstimate(input: string): number | null {
  let text = input.trim().replace(/[\s'’`]/g, '');
  if (!text) return null;
  // "4.478,5" → thousands dot + decimal comma
  if (/,\d{1,2}$/.test(text) && text.includes('.')) text = text.replace(/\./g, '');
  text = text.replace(',', '.');
  // "4.478" with exactly three decimals is most likely a thousands separator.
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('de-CH', { maximumFractionDigits: 1 });
}

/** Display a value with its unit; years without thousands separator. */
export function formatValue(value: number, unit: string): string {
  if (unit === 'Jahr') return String(Math.round(value));
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}
