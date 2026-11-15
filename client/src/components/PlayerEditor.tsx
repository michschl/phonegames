import { useState, type CSSProperties, type FormEvent } from 'react';
import { LIMITS, type PlayerGroup } from '../../../shared/types.ts';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { normalize } from '../lib/util.ts';
import { useData } from '../store/data.ts';
import { Icon } from './Icon.tsx';
import { Avatar } from './ui.tsx';

/** Add / remove players of a group. Changes are saved immediately. */
export function PlayerEditor({ group, autoFocus }: { group: PlayerGroup; autoFocus?: boolean }) {
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
          {group.players.map((player) => (
            <li
              key={player.id}
              className={`player-chip ${leaving.includes(player.id) ? 'is-leaving' : ''}`}
              style={{ '--c': player.color } as CSSProperties}
            >
              <Avatar name={player.name} color={player.color} size={32} />
              <span className="player-chip__name">{player.name}</span>
              <button
                type="button"
                className="player-chip__remove"
                aria-label={`${player.name} entfernen`}
                onClick={() => remove(player.id)}
              >
                <Icon name="x" size={16} strokeWidth={2.6} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="player-editor__count">
        {group.players.length} {group.players.length === 1 ? 'Person' : 'Personen'}
      </p>
    </div>
  );
}
