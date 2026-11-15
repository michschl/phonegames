import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Player } from '../../../../shared/types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { initials } from '../../lib/util.ts';
import { Actions, Stage } from './GameShell.tsx';

/** "Gib das Handy an …" – makes sure only the right person looks at the screen. */
export function PassPrompt({
  player,
  onReady,
  hint,
  readyLabel,
}: {
  player: Player;
  onReady: () => void;
  hint?: ReactNode;
  readyLabel?: string;
}) {
  return (
    <Stage>
      <div className="pass" style={{ '--c': player.color } as CSSProperties}>
        <p className="gs-eyebrow">Gib das Handy an</p>
        <span className="pass__avatar">{initials(player.name)}</span>
        <span className="pass__name">{player.name}</span>
        <span className="pass__hand" aria-hidden="true">
          🤲
        </span>
        {hint && <p className="gs-text">{hint}</p>}
      </div>
      <Actions>
        <Button
          size="lg"
          block
          onClick={() => {
            sound.unlock();
            sound.whoosh();
            onReady();
          }}
        >
          {readyLabel ?? `Ich bin ${player.name}`}
        </Button>
      </Actions>
    </Stage>
  );
}

/**
 * A secret that is only visible while the finger is on the card – so
 * nobody can accidentally glance at it when the phone is passed on.
 */
export function SecretReveal({
  children,
  onDone,
  doneLabel = 'Verstanden – weitergeben',
  coverText = 'Gedrückt halten zum Aufdecken',
}: {
  children: ReactNode;
  onDone: () => void;
  doneLabel?: string;
  coverText?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [seen, setSeen] = useState(false);

  const show = () => {
    if (!revealed) {
      setRevealed(true);
      setSeen(true);
      sound.flip();
      haptic(12);
    }
  };
  const hide = () => setRevealed(false);

  return (
    <Stage>
      <div
        className={`secret ${revealed ? 'is-revealed' : ''}`}
        onPointerDown={show}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onContextMenu={(e) => e.preventDefault()}
        role="button"
        aria-label={coverText}
      >
        <div className="secret__content" aria-hidden={!revealed}>
          {children}
        </div>
        <div className="secret__cover">
          <span className="secret__cover-icon" aria-hidden="true">
            🤫
          </span>
          <span className="secret__cover-text">{coverText}</span>
        </div>
      </div>
      <p className="gs-text">Niemand sonst darf hinschauen!</p>
      <Actions>
        <Button size="lg" block disabled={!seen} onClick={onDone}>
          {doneLabel}
        </Button>
      </Actions>
    </Stage>
  );
}

/**
 * Hands the phone to every player in turn: first a pass prompt, then the
 * content returned by `render` (which calls `next()` when done).
 */
export function PassTurns({
  players,
  render,
  onComplete,
  hint,
}: {
  players: Player[];
  render: (player: Player, next: () => void, index: number) => ReactNode;
  onComplete: () => void;
  hint?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const player = players[index];

  if (!player) return null;

  const next = () => {
    setReady(false);
    if (index + 1 >= players.length) onComplete();
    else setIndex(index + 1);
  };

  return ready ? (
    <div key={`content-${index}`} className="gs__body">
      {render(player, next, index)}
    </div>
  ) : (
    <PassPrompt key={`pass-${index}`} player={player} hint={hint} onReady={() => setReady(true)} />
  );
}
