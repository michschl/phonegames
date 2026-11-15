import { lazy } from 'react';
import type { GameDefinition } from '../types.ts';

export const flaschendrehen: GameDefinition<Record<string, never>> = {
  id: 'flaschendrehen',
  name: 'Flaschendrehen',
  tagline: 'Der Klassiker – ohne Scherben',
  description:
    'Handy in die Mitte, kräftig wischen – die Flasche dreht sich, klackert und zeigt auf jemanden. Auf Wunsch gleich mit einer Wahrheit-oder-Pflicht-Karte.',
  emoji: '🍾',
  colors: ['#3ddc97', '#2de2e6'],
  minPlayers: 2,
  maxPlayers: 20,
  duration: 'beliebig',
  age: 'ab 6 J.',
  tags: ['Werkzeug', 'Party', 'Familie'],
  status: 'available',
  noGroup: true,
  rules: [
    'Legt das Handy in die Mitte eurer Runde.',
    'Wischt mit Schwung im Kreis oder tippt auf «Drehen!».',
    'Auf wen der Flaschenhals zeigt, ist dran – zum Beispiel mit einer Wahrheit-oder-Pflicht-Karte.',
  ],
  defaultSettings: {},
  Play: lazy(() => import('./FlaschendrehenGame.tsx')),
};
