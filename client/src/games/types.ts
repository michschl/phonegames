import type { ComponentType, LazyExoticComponent } from 'react';
import type { Player } from '../../../shared/types.ts';

export interface GameProps<S> {
  players: Player[];
  settings: S;
  /** Leave the game and return to the setup screen. */
  onExit(): void;
}

export interface GameSettingsProps<S> {
  value: S;
  onChange(next: S): void;
}

/**
 * Everything the app needs to know about a game. Add a new game by creating
 * a folder in `src/games/<id>/` and registering its definition in
 * `registry.ts` – see docs/SPIELE.md.
 */
export interface GameDefinition<S extends object = any> {
  /** URL-safe id, also stored in the user's library. Never change it. */
  id: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  /** Two colours for the card gradient. */
  colors: [string, string];
  minPlayers: number;
  maxPlayers: number;
  /** e.g. "5–30 Min." */
  duration: string;
  /** e.g. "ab 8 J." */
  age: string;
  tags: string[];
  status: 'available' | 'soon';
  /** The game needs no player group (e.g. tools like «Zufallsfinger»). */
  noGroup?: boolean;
  /** Short rules shown on the setup screen. */
  rules?: string[];
  defaultSettings?: S;
  /** Optional settings panel rendered on the setup screen. */
  Settings?: ComponentType<GameSettingsProps<S>>;
  /** The game itself – lazy loaded so the start screen stays fast. */
  Play?: LazyExoticComponent<ComponentType<GameProps<S>>>;
  /** Optional illustration for the cards. Falls back to the emoji. */
  Art?: ComponentType<{ size?: number }>;
}
