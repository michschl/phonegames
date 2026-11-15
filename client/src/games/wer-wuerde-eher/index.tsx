import { lazy } from 'react';
import type { GameDefinition } from '../types.ts';
import { DEFAULT_PACKS, PackSettingsPanel, type PackSettings } from '../shared/packs.tsx';

export const werWuerdeEher: GameDefinition<PackSettings> = {
  id: 'wer-wuerde-eher',
  name: 'Wer würde eher …?',
  tagline: '3 – 2 – 1 – und alle zeigen auf …',
  description:
    'Wer würde eher beim Wandern den Weg verlieren? Auf «3» zeigen alle gleichzeitig auf eine Person. Lacher garantiert.',
  emoji: '👉',
  colors: ['#ff7ae0', '#ff3d8b'],
  minPlayers: 3,
  maxPlayers: 30,
  duration: '5–30 Min.',
  age: 'ab 8 J.',
  tags: ['Gespräch', 'Party', 'Schnell'],
  status: 'available',
  rules: [
    'Eine Frage erscheint, z. B. «Wer würde eher im Lotto gewinnen und alles verschenken?».',
    'Nach dem Countdown zeigen alle gleichzeitig auf eine Person.',
    'Wer die meisten Finger bekommt, wird angetippt – am Schluss gibt es die Titel des Abends.',
  ],
  defaultSettings: DEFAULT_PACKS,
  Settings: PackSettingsPanel,
  Play: lazy(() => import('./WerWuerdeEherGame.tsx')),
};
