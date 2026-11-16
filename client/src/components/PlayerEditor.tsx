import { useState, type CSSProperties, type FormEvent } from 'react';
import { LIMITS, type Player, type PlayerGroup } from '../../../shared/types.ts';
import type { PlayerStatus, PlayerStatusInfo } from '../games/types.ts';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { normalize } from '../lib/util.ts';
import { useData } from '../store/data.ts';
import { Icon } from './Icon.tsx';
import { Avatar } from './ui.tsx';

/**
 * Add / remove players of a group. Changes are saved immediately.
 * With `status`, the name tiles are coloured and show a badge (e.g. cards due in «Spickzettel»).
 */
export function PlayerEditor({ group, autoFocus, status }: { group: PlayerGroup; autoFocus?: boolean; status?: PlayerStatusInfo | null }) {
  const addPlayer = useData((s) => s.addPlayer);
  const removePlayer = useData((s) => s.removePlayer);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string[]>([]);

  const full = group.players.length >= LIMITS.playersPerGroup;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (group.players.some((p) => normalize(p.name) === normalize(trimmed))) {
      setError(`«${trimmed}» ist schon dabei.`);
      haptic([10, 30, 10]);
      return;
    }
    if (addPlayer(group.id, trimmed)) {
      sound.unlock();
      sound.pop();
      sound.release();
      haptic(10);
      setName('');
      setError(null);
    }
  };

  const remove = (playerId: string) => {
    haptic(10);
    setLeaving((ids) => [...ids, playerId]);
    window.setTimeout(() => {
      removePlayer(group.id, playerId);
      setLeaving((ids) => ids.filter((id) => id !== playerId));
    }, 220);
  };

  return (
    <div className="player-editor">
      <form className="player-editor__form" onSubmit={submit}>
        <input
          className="player-editor__input"
          value={name}
          maxLength={LIMITS.nameMax}
          placeholder={full ? 'Gruppe ist voll' : 'Name hinzufügen …'}
          aria-label="Name des Spielers"
          disabled={full}
          autoFocus={autoFocus}
          enterKeyHint="done"
          autoCapitalize="words"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <button className="player-editor__add" type="submit" disabled={!name.trim() || full} aria-label="Hinzufügen">
          <Icon name="plus" />
        </button>
      </form>
      {error && <p className="field__error">{error}</p>}

      {group.players.length === 0 ? (
        <p className="player-editor__empty">Noch niemand dabei – füge die Mitspielenden hinzu.</p>
      ) : (
        <ul className="player-list">
          {group.players.map((player) => {
            const info = status?.status(player);
            return (
              <li
                key={player.id}
                className={`player-chip ${leaving.includes(player.id) ? 'is-leaving' : ''}`}
                style={{ '--c': player.color } as CSSProperties}
              >
                <Avatar name={player.name} color={player.color} size={32} />
                <span className="player-chip__name">{player.name}</span>
                {info && info.due > 0 && (
                  <span className="due-badge" aria-hidden="true">
                    {info.due}
                  </span>
                )}
                {info?.badge && (
                  <span className={`status-badge tone-${info.tone}`} aria-hidden="true">
                    {info.badge}
                  </span>
                )}
                {info && <span className="sr-only">: {info.label}</span>}
                <button
                  type="button"
                  className="player-chip__remove"
                  aria-label={`${player.name} entfernen`}
                  onClick={() => remove(player.id)}
                >
                  <Icon name="x" size={16} strokeWidth={2.6} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="player-editor__count">
        {group.players.length} {group.players.length === 1 ? 'Person' : 'Personen'}
      </p>
      {status && <StatusLegend status={status} players={group.players} />}
    </div>
  );
}

/** Explains the badges on the name chips – only the ones that occur. */
export function StatusLegend({ status, players }: { status: PlayerStatusInfo; players: Player[] }) {
  const shown = players.map((p) => status.status(p)).filter((info): info is PlayerStatus => !!info);
  const entries = status.legend.filter((entry) => shown.some((info) => (entry.key === 'due' ? info.due > 0 : info.badge === entry.key)));
  if (entries.length === 0) return null;
  return (
    <div className="status-legend">
      <p className="status-legend__caption">{status.caption}</p>
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
