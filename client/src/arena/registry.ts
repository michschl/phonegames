import { lazy } from 'react';
import type { ArenaGame } from './types.ts';

/*
 * «Arena»: 3D games for teenagers from 13 – modern low-poly look, short rounds, records and the family
 * leaderboard. Parents can hide the Arena under «Belohnungen».
 */
export const ARENA_GAMES: ArenaGame[] = [
  {
    id: 'piste',
    name: 'Pistenjagd',
    tagline: 'Slalom, Sprünge, Tiefschnee',
    description: 'Abfahrt durch die Berge: Fahr durch die Tore, spring über die Schanzen und weiche Tannen und Felsen aus. Jede Piste hat ihre feste Strecke, ein Geist zeigt deine Bestfahrt.',
    emoji: '🎿',
    colors: ['#3a86ff', '#9fe3ff'],
    skills: ['Reaktion', 'Linienwahl'],
    rules: [
      'Steuere mit dem Finger (links/rechts ziehen) oder durch Neigen des Handys.',
      'Jedes Tor bringt Zeitbonus – ein verpasstes Tor kostet 3 Sekunden.',
      'Tannen und Felsen bremsen dich aus, Tiefschnee neben der Piste macht langsam.',
      'Je schneller im Ziel, desto mehr Punkte. Der Geist fährt deine Bestfahrt.',
    ],
    duration: '1–2 Min.',
    tilt: true,
    skinLabel: 'Ausrüstung',
    skins: [
      { id: 'rot', name: 'Classic', color: '#ff4f6d', accent: '#1d1b26', price: 0 },
      { id: 'neon', name: 'Neon', color: '#9be15d', accent: '#ff4fa3', price: 25 },
      { id: 'gletscher', name: 'Gletscher', color: '#2ec5ff', accent: '#ffffff', price: 50 },
      { id: 'gold', name: 'Gold', color: '#ffc107', accent: '#1d1b26', price: 100 },
    ],
    unit: 'Punkte',
    options: { label: 'Piste', values: ['Blau', 'Rot', 'Schwarz'] },
    Play: lazy(() => import('./piste/PisteGame.tsx')),
  },
  {
    id: 'kugel',
    name: 'Kugelbahn',
    tagline: 'Neigen, rollen, nicht runterfallen',
    description: 'Lenke eine Kugel durch schwebende Labyrinthe ins Ziel – mit Löchern, Beschleunigern und Schaltern, die Türen öffnen. 30 Level, Bestzeit pro Level.',
    emoji: '🔮',
    colors: ['#8b5cf6', '#ff7ad9'],
    skills: ['Geschick', 'Planen'],
    rules: [
      'Neige das Handy – oder zieh mit dem Finger wie mit einem Joystick.',
      'Fällt die Kugel runter, geht es beim letzten Kontrollpunkt weiter (+2 Sekunden).',
      'Blaue Schalter öffnen die blauen Tore, Pfeile beschleunigen.',
      'Jedes Level schaltet das nächste frei.',
    ],
    duration: 'je Level 20–90 Sek.',
    tilt: true,
    skinLabel: 'Kugel',
    skins: [
      { id: 'chrom', name: 'Chrom', color: '#d9e2ec', accent: '#ffffff', price: 0 },
      { id: 'lava', name: 'Lava', color: '#ff5a1f', accent: '#ffd23f', price: 25 },
      { id: 'eis', name: 'Eis', color: '#7fdcff', accent: '#ffffff', price: 50 },
      { id: 'galaxie', name: 'Galaxie', color: '#5b2bd6', accent: '#ff7ad9', price: 100 },
    ],
    unit: 'Level',
    Play: lazy(() => import('./kugel/KugelGame.tsx')),
  },
  {
    id: 'beat',
    name: 'Beat-Bahn',
    tagline: 'Im Takt auf der Neon-Strecke',
    description: 'Noten fliegen auf einer leuchtenden Strecke heran – tippe die Spur genau im Takt. Die Beats erzeugt die App selbst, jede Runde ein bisschen anders.',
    emoji: '🎧',
    colors: ['#ff4fa3', '#2ec5ff'],
    skills: ['Timing', 'Konzentration'],
    rules: [
      'Tippe auf die Spur, wenn die Note die Linie erreicht.',
      'Genau im Takt: «Perfekt!» – knapp daneben: «Gut».',
      'Viele Treffer hintereinander steigern den Multiplikator.',
      'Kopfhörer machen es leichter.',
    ],
    duration: '1½ Min.',
    tilt: false,
    skinLabel: 'Strecke',
    skins: [
      { id: 'pink', name: 'Neon Pink', color: '#ff4fa3', accent: '#2ec5ff', price: 0 },
      { id: 'cyber', name: 'Cyber', color: '#2ec5ff', accent: '#9be15d', price: 25 },
      { id: 'sunset', name: 'Sunset', color: '#ff8a3d', accent: '#ffd23f', price: 50 },
      { id: 'aurora', name: 'Aurora', color: '#9be15d', accent: '#8b5cf6', price: 100 },
    ],
    unit: 'Punkte',
    options: { label: 'Stil', values: ['Pop · 100 BPM', 'House · 122 BPM', 'Chip · 140 BPM'] },
    Play: lazy(() => import('./beat/BeatGame.tsx')),
  },
  {
    id: 'raum',
    name: 'Raumdenker',
    tagline: 'Würfelbauten im Kopf drehen',
    description: 'Wie sieht der Bau von oben aus? Wie viele Würfel sind es? Ist das derselbe Bau – nur gedreht – oder sein Spiegelbild? Dreh die 3D-Bauten mit dem Finger.',
    emoji: '🧊',
    colors: ['#2bb673', '#9be15d'],
    skills: ['Raumvorstellung', 'Geometrie'],
    rules: [
      '12 Aufgaben pro Runde, sie werden immer kniffliger.',
      'Dreh die Bauten mit dem Finger, um sie von allen Seiten anzuschauen.',
      'Richtig und schnell gibt mehr Punkte.',
    ],
    duration: '2–3 Min.',
    tilt: false,
    skinLabel: 'Farben',
    skins: [
      { id: 'mint', name: 'Mint', color: '#2bb673', accent: '#9be15d', price: 0 },
      { id: 'beere', name: 'Beere', color: '#ff4f6d', accent: '#ffb3c1', price: 25 },
      { id: 'ozean', name: 'Ozean', color: '#3a86ff', accent: '#7fdcff', price: 50 },
      { id: 'mono', name: 'Mono', color: '#4a4757', accent: '#e6e6ee', price: 100 },
    ],
    unit: 'Punkte',
    Play: lazy(() => import('./raum/RaumGame.tsx')),
  },
  {
    id: 'drohne',
    name: 'Drohnen-Parcours',
    tagline: 'Durch die Tore – auf Zeit',
    description: 'Flieg deine Drohne durch die leuchtenden Tore – in der Stadt zwischen den Häusern, im Wald zwischen den Tannen oder in der Halle um die Säulen. Ein Pfeil zeigt zum nächsten Tor, ein Geist fliegt deine Bestzeit.',
    emoji: '🛸',
    colors: ['#2ec5ff', '#8b5cf6'],
    skills: ['Feinmotorik', 'Orientierung'],
    rules: [
      'Flieg die Tore der Reihe nach durch – das nächste leuchtet, der Pfeil zeigt hin.',
      '«Einfach»: Die Drohne fliegt von selbst, du lenkst mit einem Daumen.',
      '«Profi»: zwei Daumen – links drehen und Höhe, rechts vor, zurück und seitwärts.',
      'Anstossen bremst dich kurz aus. Die Zeit zählt.',
    ],
    duration: '1 Min.',
    tilt: true,
    skinLabel: 'Drohne',
    skins: [
      { id: 'blau', name: 'Sky', color: '#2ec5ff', accent: '#ffffff', price: 0 },
      { id: 'racer', name: 'Racer', color: '#ff4f6d', accent: '#ffd23f', price: 25 },
      { id: 'stealth', name: 'Stealth', color: '#2a2540', accent: '#9be15d', price: 50 },
      { id: 'gold', name: 'Gold', color: '#ffc107', accent: '#ff4fa3', price: 100 },
    ],
    unit: 'Punkte',
    options: { label: 'Strecke', values: ['Stadt', 'Wald', 'Halle'] },
    modes: {
      label: 'Modus',
      values: ['Einfach', 'Profi'],
      hints: ['Ein Daumen, die Drohne fliegt von selbst vorwärts.', 'Zwei Daumen wie bei einer echten Drohne.'],
    },
    Play: lazy(() => import('./drone/DroneGame.tsx')),
  },
];

export function getArenaGame(id: string | undefined): ArenaGame | undefined {
  return ARENA_GAMES.find((game) => game.id === id);
}

/** Levels of the Kugelbahn. */
export const KUGEL_LEVELS = 30;

/** Leaderboard key of a game and choice. Kugelbahn: the highest level finished. */
export function arenaKey(game: ArenaGame, option: number): string {
  if (game.id === 'kugel') return 'kugel:level';
  return game.options ? `${game.id}:${option}` : game.id;
}
