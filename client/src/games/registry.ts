import type { GameDefinition } from './types.ts';
import { bombe } from './bombe/index.ts';
import { spion } from './spion/index.tsx';
import { doppelgaenger } from './doppelgaenger/index.tsx';
import { dorf } from './dorf/index.tsx';
import { werBinIch } from './wer-bin-ich/index.tsx';
import { pantomime } from './pantomime/index.tsx';
import { verboteneWoerter } from './verbotene-woerter/index.tsx';
import { hutspiel } from './hutspiel/index.tsx';
import { zeichnen } from './zeichnen/index.tsx';
import { summRaten } from './summ-raten/index.tsx';

/**
 * Coming-soon entries make the catalogue searchable before the games exist.
 * Replace them with real definitions once they are implemented.
 */
const comingSoon: GameDefinition[] = [
  {
    id: 'schaetzmeister',
    name: 'Schätzmeister',
    tagline: 'Wer liegt am nächsten?',
    description: 'Verrückte Schätzfragen – wer am weitesten daneben liegt, verliert einen Punkt.',
    emoji: '🎯',
    colors: ['#ffd23f', '#ff8a3d'],
    minPlayers: 2,
    maxPlayers: 12,
    duration: '15–30 Min.',
    age: 'ab 10 J.',
    tags: ['Wissen', 'Ruhig'],
    status: 'soon',
  },
];

export const GAMES: GameDefinition[] = [
  bombe,
  spion,
  doppelgaenger,
  dorf,
  werBinIch,
  pantomime,
  verboteneWoerter,
  hutspiel,
  zeichnen,
  summRaten,
  ...comingSoon,
];

export function getGame(id: string | undefined): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
