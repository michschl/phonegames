import type { ComponentType, LazyExoticComponent } from 'react';

/*
 * «Arena»: 3D games for teenagers (13+). Each game draws a 3D scene with three.js (loaded only when the
 * Arena is opened) and reports a score; records go into the family leaderboard.
 */

export interface ArenaResult {
  score: number;
  stars: number;
  summary: string;
  /** Leaderboard key of this score (defaults to the game id). */
  key?: string;
  /** Further records to keep, e.g. «kugel:level» = the highest level finished. */
  records?: Record<string, number>;
}

export interface ArenaPlayProps {
  player: string;
  /** The chosen skin (item id of ArenaGame.skins). */
  skin: string;
  /** Pistenjagd: the run. Kugelbahn: the level (0-based). Beat-Bahn: the style. */
  option: number;
  /** Steer by tilting the phone (instead of the finger). */
  tilt: boolean;
  /** The chosen mode (index of ArenaGame.modes), e.g. «Einfach» or «Profi». */
  mode: number;
  onFinish(result: ArenaResult): void;
  onQuit(): void;
}

export interface ArenaSkin {
  id: string;
  name: string;
  /** Main colour (and second colour) of the item. */
  color: string;
  accent: string;
  /** Coins while «Belohnungen» is on; 0 = free. */
  price: number;
}

export interface ArenaGame {
  id: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  colors: [string, string];
  skills: string[];
  rules: string[];
  duration: string;
  /** The neighbouring sensor (tilting) is offered. */
  tilt: boolean;
  /** Skins to choose; the first one is free. */
  skins: ArenaSkin[];
  skinLabel: string;
  /** Unit of the score in the leaderboard. */
  unit: string;
  /** A choice before the round (runs, styles); the leaderboard is per choice. Kugelbahn has levels instead. */
  options?: { label: string; values: string[] };
  /** Levels to play one after the other (Kugelbahn, Orbit): the leaderboard counts the levels finished. */
  levels?: number;
  /** A way to play that does not change the leaderboard, e.g. the controls («Einfach», «Profi»). */
  modes?: { label: string; values: string[]; hints?: string[] };
  Play: LazyExoticComponent<ComponentType<ArenaPlayProps>>;
}
