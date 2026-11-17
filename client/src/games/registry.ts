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
import { schaetzmeister } from './schaetzmeister/index.tsx';
import { mehrOderWeniger } from './mehr-oder-weniger/index.tsx';
import { werWuerdeEher } from './wer-wuerde-eher/index.tsx';
import { wahrheitOderPflicht } from './wahrheit-oder-pflicht/index.tsx';
import { ichHabNochNie } from './ich-hab-noch-nie/index.tsx';
import { zufallsfinger } from './zufallsfinger/index.tsx';
import { flaschendrehen } from './flaschendrehen/index.tsx';
import { spickzettel } from './spickzettel/index.tsx';

/**
 * The games of the catalogue («Spiele», «Entdecken»), in catalogue order. To add a game, create a
 * folder with an index.tsx exporting its GameDefinition and add it here (see docs/SPIELE.md).
 */
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
  schaetzmeister,
  mehrOderWeniger,
  werWuerdeEher,
  wahrheitOderPflicht,
  ichHabNochNie,
  zufallsfinger,
  flaschendrehen,
];

/**
 * Not in the catalogue: «Lernen» is a section of its own (tab /lernen). Its modes for playing
 * together still run on the game screen (/spiel/spickzettel/los), so it can be looked up.
 */
const SECTIONS: GameDefinition[] = [spickzettel];

/** Any game by id – catalogue games and the ones behind sections like «Lernen». */
export function getGame(id: string | undefined): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id) ?? SECTIONS.find((game) => game.id === id);
}

/** A game of the catalogue – what «Meine Spiele», «Weiterspielen» and «Entdecken» show. */
export function getCatalogGame(id: string | undefined): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
