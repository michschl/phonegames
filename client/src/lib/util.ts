/** Random id that works in every browser (crypto.randomUUID needs a secure context). */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lower-case and strip diacritics: "Zürich" → "zurich". Used for search. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

export function pickRandom<T>(items: readonly T[]): T {
  return items[randomInt(items.length)]!;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Player / avatar colours – bright, readable on the dark background. */
export const PLAYER_COLORS = [
  '#ff3d8b',
  '#ff8a3d',
  '#ffd23f',
  '#3ddc97',
  '#2de2e6',
  '#5b8cff',
  '#8b5cf6',
  '#ff5e5e',
  '#c6f135',
  '#ff7ae0',
] as const;

export function nextColor(used: readonly string[]): string {
  const free = PLAYER_COLORS.filter((c) => !used.includes(c));
  return free[0] ?? PLAYER_COLORS[used.length % PLAYER_COLORS.length]!;
}

export const AVATAR_EMOJIS = [
  '🦊', '🐼', '🦄', '🐸', '🐙', '🦁', '🐵', '🐧', '🦉', '🐯', '🐨', '🦖',
  '👾', '🤖', '🎃', '🌵', '🍕', '🌈', '⚡', '🔥', '🎸', '🚀', '👑', '🍩',
] as const;

export const GROUP_EMOJIS = ['🎉', '🍻', '🏠', '👨‍👩‍👧‍👦', '🎂', '🏕️', '⛷️', '🎄', '🧀', '🌴', '🎲', '💼'] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0]!)[0]!.toUpperCase();
  return (Array.from(parts[0]!)[0]! + Array.from(parts[1]!)[0]!).toUpperCase();
}

export function formatRelative(ts: number | null): string {
  if (!ts) return 'noch nie';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'gerade eben';
  if (diff < 3_600_000) return `vor ${Math.round(diff / 60_000)} Min.`;
  if (diff < 86_400_000) return `vor ${Math.round(diff / 3_600_000)} Std.`;
  return new Date(ts).toLocaleDateString('de-CH');
}

/** Word joints where long game names may break ("Zufalls|finger"), marked with soft hyphens. */
const NAME_JOINTS: Record<string, string> = {
  Doppelgänger: 'Doppel­gänger',
  Flaschendrehen: 'Flaschen­drehen',
  Pantomime: 'Panto­mime',
  Schätzmeister: 'Schätz­meister',
  Zufallsfinger: 'Zufalls­finger',
  Hutspiel: 'Hut­spiel',
  Wahrheit: 'Wahr­heit',
  Spickzettel: 'Spick­zettel',
  Pistenjagd: 'Pisten­jagd',
  Kugelbahn: 'Kugel­bahn',
  Raumdenker: 'Raum­denker',
  Golfinsel: 'Golf­insel',
  Kettenreaktion: 'Ketten­reaktion',
  Parcours: 'Par­cours',
  Spielgruppen: 'Spiel­gruppen',
  Belohnungen: 'Beloh­nungen',
};

/**
 * Game name for big titles: breaks only at real word joints. Pair with `hyphens: manual`
 * so the browser never invents its own break like "Zufallsfin-ger".
 */
export function breakableName(name: string): string {
  return name.replace(/[A-Za-zÄÖÜäöüß]+/g, (word) => NAME_JOINTS[word] ?? word);
}
