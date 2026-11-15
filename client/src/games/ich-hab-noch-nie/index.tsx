import { lazy } from 'react';
import type { GameDefinition } from '../types.ts';
import { DEFAULT_PACKS, PackSettingsPanel, type PackSettings } from '../shared/packs.tsx';

export const ichHabNochNie: GameDefinition<PackSettings> = {
  id: 'ich-hab-noch-nie',
  name: 'Ich hab noch nie …',
  tagline: 'Wer hat schon? Aufstehen!',
  description:
    '«Ich hab noch nie den Zug verpasst, weil ich zu lange Kaffee getrunken habe.» Wer es doch schon getan hat, steht auf – und erzählt die Geschichte dazu.',
  emoji: '🙋',
  colors: ['#3ddc97', '#c6f135'],
  minPlayers: 3,
  maxPlayers: 30,
  duration: '10–40 Min.',
  age: 'ab 10 J.',
  tags: ['Gespräch', 'Party', 'Kennenlernen'],
  status: 'available',
  rules: [
    'Eine Aussage erscheint: «Ich hab noch nie …».',
    'Wer es schon getan hat, steht kurz auf (oder hebt die Hand) – Geschichten erwünscht!',
    'Tippt die Personen an, um zu sehen, wer am meisten erlebt hat.',
  ],
  defaultSettings: DEFAULT_PACKS,
  Settings: PackSettingsPanel,
  Play: lazy(() => import('./IchHabNochNieGame.tsx')),
};
