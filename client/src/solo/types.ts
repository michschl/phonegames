import type { ComponentType, LazyExoticComponent } from 'react';

/** 1 = for 6 to 9 years, 2 = for 8 to 12 years. Each game also gets harder while it runs. */
export type SoloLevel = 1 | 2;

export const LEVEL_LABEL: Record<SoloLevel, string> = { 1: '6–9 Jahre', 2: '8–12 Jahre' };

export interface SoloResult {
  /** Points – higher is better (also for games about few moves). */
  score: number;
  /** 0 to 3 stars. */
  stars: number;
  /** «14 Züge in 38 Sekunden» */
  summary: string;
}

export interface SoloPlayProps {
  level: SoloLevel;
  player: string;
  /** Phoni-Rennen: the chosen car. */
  car?: string;
  onFinish(result: SoloResult): void;
  /** Leave the round early. */
  onQuit(): void;
}

/** A game of «Allein spielen» – simple, quick rounds that train one skill each. */
export interface SoloGame {
  id: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  colors: [string, string];
  /** What it trains, e.g. «Reaktion», «Merken». */
  skills: string[];
  rules: Record<SoloLevel, string[]>;
  /** About how long a round takes. */
  duration: string;
  Play: LazyExoticComponent<ComponentType<SoloPlayProps>>;
}
