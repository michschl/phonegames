import { lazy } from 'react';
import type { GameDefinition } from '../types.ts';
import { BombArt } from './BombGraphic.tsx';
import { BombeSettingsPanel } from './BombeSettingsPanel.tsx';
import { DEFAULT_SETTINGS, type BombeSettings } from './logic.ts';

export const bombe: GameDefinition<BombeSettings> = {
  id: 'bombe',
  name: 'Bombe',
  tagline: 'Antworten, weitergeben – bevor es knallt!',
  description:
    'Eine Frage, eine tickende Bombe und ein Handy, das blitzschnell die Runde macht. ' +
    'Wer die Bombe hält, wenn sie explodiert, hat verloren.',
  emoji: '💣',
  colors: ['#ff3d8b', '#ff8a3d'],
  minPlayers: 2,
  maxPlayers: 30,
  duration: '5–60 Min.',
  age: 'ab 6 J.',
  tags: ['Schnell', 'Laut', 'Wörter', 'Party'],
  status: 'available',
  rules: [
    'Eine zufällig ausgeloste Person beginnt und drückt auf Start.',
    'Eine Frage erscheint, z. B. «Was nimmt man in die Ferien mit?» – und die Bombe tickt.',
    'Antwort laut sagen, Handy der nächsten Person geben. Diese antwortet ebenfalls und gibt weiter.',
    'Keine Antwort doppelt! Wer die Bombe hält, wenn sie explodiert, hat verloren.',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings: BombeSettingsPanel,
  Play: lazy(() => import('./BombeGame.tsx')),
  Art: BombArt,
};
