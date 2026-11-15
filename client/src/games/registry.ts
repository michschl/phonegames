import type { GameDefinition } from './types.ts';
import { bombe } from './bombe/index.ts';
import { spion } from './spion/index.tsx';
import { doppelgaenger } from './doppelgaenger/index.tsx';
import { dorf } from './dorf/index.tsx';

/**
 * Coming-soon entries make the catalogue searchable before the games exist.
 * Replace them with real definitions once they are implemented.
 */
const comingSoon: GameDefinition[] = [
  {
    id: 'pantomime',
    name: 'Pantomime',
    tagline: 'Ohne Worte zum Sieg',
    description: 'Begriffe pantomimisch darstellen, das Team rät gegen die Uhr.',
    emoji: '🎭',
    colors: ['#8b5cf6', '#2de2e6'],
    minPlayers: 4,
    maxPlayers: 20,
    duration: '15–45 Min.',
    age: 'ab 8 J.',
    tags: ['Teams', 'Bewegung', 'Raten'],
    status: 'soon',
  },
  {
    id: 'wer-bin-ich',
    name: 'Wer bin ich?',
    tagline: 'Handy an die Stirn und los',
    description: 'Halte das Handy an die Stirn und errate die Figur anhand der Hinweise deiner Freunde.',
    emoji: '🤔',
    colors: ['#3ddc97', '#2de2e6'],
    minPlayers: 2,
    maxPlayers: 12,
    duration: '10–30 Min.',
    age: 'ab 8 J.',
    tags: ['Raten', 'Schnell'],
    status: 'soon',
  },
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

export const GAMES: GameDefinition[] = [bombe, spion, doppelgaenger, dorf, ...comingSoon];

export function getGame(id: string | undefined): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
