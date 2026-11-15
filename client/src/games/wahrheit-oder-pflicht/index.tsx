import { lazy } from 'react';
import type { GameDefinition } from '../types.ts';
import { DEFAULT_PACKS, PackSettingsPanel, type PackSettings } from '../shared/packs.tsx';

export const wahrheitOderPflicht: GameDefinition<PackSettings> = {
  id: 'wahrheit-oder-pflicht',
  name: 'Wahrheit oder Pflicht',
  tagline: 'Ehrlich antworten oder mutig sein',
  description:
    'Das Roulette wählt, wer dran ist. Wahrheit oder Pflicht? Über 190 Karten – von familienfreundlich bis frech.',
  emoji: '🔥',
  colors: ['#ff8a3d', '#ff3d8b'],
  minPlayers: 2,
  maxPlayers: 20,
  duration: '15–60 Min.',
  age: 'ab 8 J.',
  tags: ['Gespräch', 'Party', 'Mutprobe'],
  status: 'available',
  rules: [
    'Das Roulette wählt eine Person aus.',
    'Sie entscheidet: Wahrheit (ehrlich antworten) oder Pflicht (Aufgabe erledigen) – oder lässt den Zufall entscheiden.',
    'Geschafft gibt einen Punkt. Wer kneift, bekommt ein 🐔.',
  ],
  defaultSettings: DEFAULT_PACKS,
  Settings: PackSettingsPanel,
  Play: lazy(() => import('./WahrheitOderPflichtGame.tsx')),
};
