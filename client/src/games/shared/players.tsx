import type { CSSProperties, ReactNode } from 'react';
import type { Player } from '../../../../shared/types.ts';
import { Avatar } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { pickRandom, shuffle } from '../../lib/util.ts';
import type { PlayerStatus } from '../types.ts';

/* ------------------------------------------------------------------ teams */

export interface Team {
  id: string;
  name: string;
  color: string;
  players: Player[];
}

const TEAM_NAMES = [
  'Raclette-Raketen',
  'Gipfelstürmer',
  'Schoggi-Bande',
  'Murmeltiere',
  'Fondue-Profis',
  'Alpenglühn',
  'Edelweiss-Crew',
  'Velo-Gang',
  'Bergkristalle',
  'Rösti-Rebellen',
  'Seebuebe',
  'Tüüfel',
];
const TEAM_COLORS = ['#ff3d8b', '#2de2e6', '#ffd23f', '#8b5cf6'];

/** Randomly split players into `count` teams of (almost) equal size. */
export function makeTeams(players: Player[], count = 2): Team[] {
  const names = shuffle(TEAM_NAMES).slice(0, count);
  const teams: Team[] = names.map((name, i) => ({ id: `team-${i}`, name, color: TEAM_COLORS[i]!, players: [] }));
  shuffle(players).forEach((player, i) => teams[i % count]!.players.push(player));
  return teams;
}

export function TeamCards({ teams, scores }: { teams: Team[]; scores?: Record<string, number> }) {
  return (
    <div className="teams">
      {teams.map((team, i) => (
        <div key={team.id} className="team-card" style={{ '--c': team.color, animationDelay: `${i * 80}ms` } as CSSProperties}>
          <p className="team-card__name">
            {team.name}
            {scores && ` · ${scores[team.id] ?? 0}`}
          </p>
          <ul className="team-card__players">
            {team.players.map((p) => (
              <li key={p.id}>
                <Avatar name={p.name} color={p.color} size={26} />
                <span>{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- scores */

export interface ScoreEntry {
  id: string;
  name: string;
  color: string;
  score: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Sorted ranking with medals. */
export function ScoreList({ entries, unit = 'Pkt.' }: { entries: ScoreEntry[]; unit?: string }) {
  const sorted = [...entries].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = sorted[0]?.score ?? 0;
  return (
    <ol className="score-list">
      {sorted.map((entry, i) => {
        const rank = sorted.findIndex((e) => e.score === entry.score);
        return (
          <li
            key={entry.id}
            className={`score-list__item ${entry.score === top && top > 0 ? 'is-leader' : ''}`}
            style={{ '--c': entry.color, animationDelay: `${i * 50}ms` } as CSSProperties}
          >
            <span className="score-list__pos">{entry.score > 0 && rank < 3 ? MEDALS[rank] : `${rank + 1}.`}</span>
            <span className="team-dot" />
            <span className="score-list__name">{entry.name}</span>
            <span className="score-list__score">
              {entry.score} <small>{unit}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function playerScores(players: Player[], scores: Record<string, number>): ScoreEntry[] {
  return players.map((p) => ({ id: p.id, name: p.name, color: p.color, score: scores[p.id] ?? 0 }));
}

export function teamScores(teams: Team[], scores: Record<string, number>): ScoreEntry[] {
  return teams.map((t) => ({ id: t.id, name: t.name, color: t.color, score: scores[t.id] ?? 0 }));
}

/* ----------------------------------------------------------------- picker */

/** Grid of players to tap on (votes, "who guessed it?", …). */
export function PlayerPicker({
  players,
  selected,
  onSelect,
  disabled,
  badge,
  status,
  quiet,
}: {
  players: Player[];
  selected?: string | string[] | null;
  onSelect: (player: Player) => void;
  disabled?: (player: Player) => boolean;
  badge?: (player: Player) => ReactNode;
  /** Colours the tile and shows a status line and a round badge (e.g. cards due). */
  status?: (player: Player) => PlayerStatus | undefined;
  /** No tap sound or vibration, e.g. at night when nobody may hear who is choosing. */
  quiet?: boolean;
}) {
  const isSelected = (id: string) => (Array.isArray(selected) ? selected.includes(id) : selected === id);
  return (
    <div className={`pick-grid ${status ? 'pick-grid--status' : ''}`}>
      {players.map((player) => {
        const info = status?.(player);
        return (
          <button
            key={player.id}
            type="button"
            className={`pick-chip ${info ? `has-status tone-${info.tone}` : ''} ${isSelected(player.id) ? 'is-selected' : ''}`}
            style={{ '--c': player.color } as CSSProperties}
            disabled={disabled?.(player)}
            aria-pressed={isSelected(player.id)}
            onClick={() => {
              if (!quiet) {
                sound.tap();
                haptic(10);
              }
              onSelect(player);
            }}
          >
            <Avatar name={player.name} color={player.color} size={34} />
            {info ? (
              <span className="pick-chip__text">
                <span className="pick-chip__name">{player.name}</span>
                <span className="pick-chip__status">{info.label}</span>
              </span>
            ) : (
              <span className="pick-chip__name">{player.name}</span>
            )}
            {info && info.due > 0 && (
              <span className="due-badge due-badge--corner" aria-hidden="true">
                {info.due}
              </span>
            )}
            {info?.badge && (
              <span className="status-badge status-badge--corner" aria-hidden="true">
                {info.badge}
              </span>
            )}
            {badge && <span className="pick-chip__badge">{badge(player)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Replace `{person}` with the name of a random other player. */
export function fillPerson(text: string, players: Player[], exclude?: string): string {
  if (!text.includes('{person}')) return text;
  const others = players.filter((p) => p.id !== exclude);
  const name = others.length > 0 ? pickRandom(others).name : 'jemandem';
  return text.replaceAll('{person}', name);
}
