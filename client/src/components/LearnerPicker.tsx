import { useState, type CSSProperties, type FormEvent } from 'react';
import { LIMITS, type Player } from '../../../shared/types.ts';
import type { PlayerStatus, PlayerStatusInfo } from '../games/types.ts';
import { KASTEN_LEGEND, useKastenTiles } from '../games/spickzettel/status.ts';
import { haptic } from '../lib/device.ts';
import { sameName } from '../lib/learners.ts';
import { sound } from '../lib/audio.ts';
import { useStreaks } from '../store/learners.ts';
import { useSettings } from '../store/settings.ts';
import { removeLearnerWithUndo } from '../store/undo.ts';
import { Icon } from './Icon.tsx';
import { Avatar } from './ui.tsx';

/**
 * «Wer lernt?»: one tile per person, coloured by the state of their Kartenkasten for the stack,
 * with the red number of cards due. A new name is added right here – no group needed. While
 * editing, a tap removes the person from this stack (with «Rückgängig»).
 */
export function LearnerPicker({
  stackId,
  learners,
  selected,
  onSelect,
  editing = false,
}: {
  stackId: string;
  learners: Player[];
  selected: string | null;
  onSelect: (name: string) => void;
  editing?: boolean;
}) {
  const tiles = useKastenTiles(stackId);
  const streak = useStreaks();
  const addLearnerName = useSettings((s) => s.addLearnerName);
  const showLearner = useSettings((s) => s.showLearner);
  const [adding, setAdding] = useState(learners.length === 0);
  const [name, setName] = useState('');

  const add = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim().slice(0, LIMITS.nameMax);
    if (!trimmed) return;
    const existing = learners.find((p) => sameName(p.name, trimmed));
    if (!existing) addLearnerName(trimmed);
    // Removed from this stack before: added again, so back in the list.
    showLearner(stackId, trimmed);
    sound.pop();
    haptic(10);
    onSelect(existing?.name ?? trimmed);
    setName('');
    setAdding(false);
  };

  if (editing) {
    return (
      <div className="learner-picker">
        <p className="learner-picker__hint">
          Tippe eine Person an, um sie aus diesem Stapel zu entfernen. Ihr Kartenkasten für diesen Stapel wird dabei gelöscht.
        </p>
        <div className="learner-grid" role="group" aria-label="Personen entfernen">
          {learners.map((player) => {
            const info = tiles?.(player);
            return (
              <button
                key={player.id}
                type="button"
                className={`learner-tile is-editing ${info ? `tone-${info.tone}` : ''}`}
                style={{ '--c': player.color } as CSSProperties}
                aria-label={`${player.name} entfernen`}
                onClick={() => {
                  haptic(12);
                  removeLearnerWithUndo(stackId, player.name);
                }}
              >
                <Avatar name={player.name} color={player.color} size={34} />
                <span className="learner-tile__text">
                  <span className="learner-tile__name">{player.name}</span>
                  {info && <span className="learner-tile__status">{info.label}</span>}
                </span>
                <span className="learner-tile__remove" aria-hidden="true">
                  <Icon name="x" size={16} strokeWidth={3.2} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="learner-picker">
      <div className="learner-grid" role="radiogroup" aria-label="Wer lernt?">
        {learners.map((player) => {
          const info = tiles?.(player);
          const active = sameName(player.name, selected);
          return (
            <button
              key={player.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`learner-tile ${info ? `tone-${info.tone}` : ''} ${active ? 'is-selected' : ''}`}
              style={{ '--c': player.color } as CSSProperties}
              onClick={() => {
                haptic(8);
                onSelect(player.name);
              }}
            >
              <Avatar name={player.name} color={player.color} size={34} />
              <span className="learner-tile__text">
                <span className="learner-tile__name">
                  {player.name}
                  <Streak days={streak(player.name)} />
                </span>
                {info && <span className="learner-tile__status">{info.label}</span>}
              </span>
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
              {active && (
                <span className="learner-tile__check" aria-hidden="true">
                  <Icon name="check" size={14} strokeWidth={3.2} />
                </span>
              )}
            </button>
          );
        })}
        {!adding && (
          <button type="button" className="learner-tile learner-tile--add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={20} />
            <span>Person hinzufügen</span>
          </button>
        )}
      </div>
      {adding && (
        <form className="player-editor__form learner-picker__form" onSubmit={add}>
          <input
            className="player-editor__input"
            value={name}
            maxLength={LIMITS.nameMax}
            placeholder="Name"
            aria-label="Wer lernt? Name"
            autoFocus={learners.length > 0}
            enterKeyHint="done"
            autoCapitalize="words"
            onChange={(e) => setName(e.target.value)}
          />
          <button className="player-editor__add" type="submit" disabled={!name.trim()} aria-label="Hinzufügen">
            <Icon name="plus" />
          </button>
        </form>
      )}
      {tiles && <StatusLegend status={{ caption: 'Kartenkasten', legend: KASTEN_LEGEND, status: tiles }} players={learners} />}
    </div>
  );
}

/** Explains the badges on the name tiles – only the ones that occur. */
export function StatusLegend({ status, players }: { status: PlayerStatusInfo; players: Player[] }) {
  const shown = players.map((p) => status.status(p)).filter((info): info is PlayerStatus => !!info);
  const entries = status.legend.filter((entry) => shown.some((info) => (entry.key === 'due' ? info.due > 0 : info.badge === entry.key)));
  if (entries.length === 0) return null;
  return (
    <div className="status-legend">
      <ul>
        {entries.map((entry) => (
          <li key={entry.key}>
            {entry.key === 'due' ? (
              <span className="due-badge due-badge--small" aria-hidden="true" />
            ) : (
              <span className={`status-badge status-badge--small tone-${entry.tone ?? 'neutral'}`} aria-hidden="true">
                {entry.key}
              </span>
            )}
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «🔥 3» after a name: days in a row – shown from the second day on. */
export function Streak({ days }: { days: number }) {
  if (days < 2) return null;
  return (
    <span className="streak" title={`${days} Tage in Folge gelernt`}>
      <span aria-hidden="true">🔥{days}</span>
      <span className="sr-only">, {days} Tage in Folge</span>
    </span>
  );
}
