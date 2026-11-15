import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, IconButton, Sheet } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { useWakeLock } from '../../lib/device.ts';
import { useSettings } from '../../store/settings.ts';
import './game-shell.css';

interface GameShellProps {
  /** Shown in the middle of the top bar, e.g. "Runde 2". */
  label?: ReactNode;
  onExit: () => void;
  /** Content of the "Spielstand" sheet (trophy button). Omit to hide the button. */
  scoreboard?: ReactNode;
  /** Extra content in the exit confirmation, e.g. the final ranking. */
  exitContent?: ReactNode;
  /** Ask before leaving? Defaults to true. */
  confirmExit?: boolean;
  /** Accent colour for the background glow. */
  accent?: string;
  /** Darker "night" look. */
  night?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Full-screen frame shared by all games: top bar with exit, sound toggle and
 * optional scoreboard, glowing background and a wake lock.
 */
export function GameShell({
  label,
  onExit,
  scoreboard,
  exitContent,
  confirmExit = true,
  accent = '#ff3d8b',
  night,
  className = '',
  children,
}: GameShellProps) {
  const soundOn = useSettings((s) => s.sound);
  const setSound = useSettings((s) => s.setSound);
  const [exitOpen, setExitOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);

  useWakeLock(true);
  useEffect(() => sound.setMuted(!soundOn), [soundOn]);

  return (
    <div className={`gs ${night ? 'gs--night' : ''} ${className}`} style={{ '--accent': accent } as CSSProperties}>
      <header className="gs__bar">
        <IconButton icon="x" label="Spiel beenden" onClick={() => (confirmExit ? setExitOpen(true) : onExit())} />
        <span className="gs__label">{label}</span>
        <div className="gs__bar-actions">
          <IconButton icon={soundOn ? 'volume' : 'mute'} label={soundOn ? 'Ton aus' : 'Ton an'} onClick={() => setSound(!soundOn)} />
          {scoreboard && <IconButton icon="trophy" label="Spielstand" onClick={() => setScoresOpen(true)} />}
        </div>
      </header>

      <main className="gs__body">{children}</main>

      {scoreboard && (
        <Sheet open={scoresOpen} onClose={() => setScoresOpen(false)} title="Spielstand">
          {scoreboard}
          <div className="sheet__actions">
            <Button variant="secondary" block onClick={() => setScoresOpen(false)}>
              Weiterspielen
            </Button>
          </div>
        </Sheet>
      )}

      <Sheet open={exitOpen} onClose={() => setExitOpen(false)} title="Spiel beenden?">
        {exitContent ?? <p className="sheet__text">Der aktuelle Spielstand geht verloren.</p>}
        <div className="sheet__actions">
          <Button variant="danger" size="lg" block onClick={onExit}>
            Beenden
          </Button>
          <Button variant="ghost" block onClick={() => setExitOpen(false)}>
            Weiterspielen
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** Centered column used for most game screens. */
export function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`gs-stage ${className}`}>{children}</section>;
}

/** Big headline in the display font. */
export function Headline({ children, small }: { children: ReactNode; small?: boolean }) {
  return <h1 className={`gs-headline ${small ? 'gs-headline--small' : ''}`}>{children}</h1>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="gs-eyebrow">{children}</p>;
}

/** Glass card for prompts, questions and words. `cardKey` re-triggers the enter animation. */
export function PromptCard({
  children,
  eyebrow,
  cardKey,
  tone,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  cardKey?: string | number;
  tone?: string;
}) {
  return (
    <div className="gs-card" key={cardKey} style={tone ? ({ '--tone': tone } as CSSProperties) : undefined}>
      {eyebrow && <span className="gs-card__eyebrow">{eyebrow}</span>}
      <div className="gs-card__text">{children}</div>
    </div>
  );
}

/** Bottom action area. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="gs-actions">{children}</div>;
}
