import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '../../../../shared/types.ts';
import type { GameProps } from '../types.ts';
import { StarterRoulette } from '../../components/StarterRoulette.tsx';
import { Avatar, Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { prefersReducedMotion } from '../../lib/util.ts';
import { pickStarter } from '../bombe/logic.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { nextGame, useReportScores } from '../shared/results.ts';
import { Die } from './Dice.tsx';
import { afterMove, DROP, HOLES, holesOf, newGame, pass, play, ranking, rollDice, type PlumpsSettings, type PlumpsState, type Roll } from './logic.ts';
import { doubleHit, land, lastStick, plump, rattle, stickIn, stickOut } from './sounds.ts';
import './plumps.css';

/*
 * «Plumps!» on the screen: the box seen from the front, its lid with the six holes, the dice below it.
 * The phone lies in the middle of the table; whoever is on taps the dice.
 *
 * The rules live in logic.ts. `truth` is the state of the rules, `game` is what the screen shows – it
 * follows step by step, so a stick first leaves the hand, flies, and only then stands in its hole.
 */

type Phase = 'starter' | 'roll' | 'rolling' | 'choose' | 'moving' | 'decide' | 'won' | 'over';
type Tone = 'calm' | 'good' | 'bad' | 'wow';

/** Where the holes sit, in percent of the board; `row` puts those further to the front on top. */
const SPOTS: Record<number, { x: number; y: number; row: number }> = {
  1: { x: 18.6, y: 29.3, row: 2 },
  2: { x: 50, y: 16.5, row: 1 },
  3: { x: 81.4, y: 29.3, row: 2 },
  4: { x: 69.4, y: 50, row: 4 },
  5: { x: 30.6, y: 50, row: 4 },
  6: { x: 50, y: 35, row: 3 },
};

const NO_POINTS: Record<string, number> = {};
const MEDALS = ['🥇', '🥈', '🥉'];
const ROLL_MS = 950;

interface Point {
  x: number;
  y: number;
}

/** A stick flies across the screen in an arc – from a hand into a hole or back. */
function fly(from: Point, to: Point, color: string, ms: number, spin: number): Promise<void> {
  if (prefersReducedMotion() || typeof document.body.animate !== 'function') return Promise.resolve();
  const stick = document.createElement('span');
  stick.className = 'plumps-fly';
  stick.setAttribute('aria-hidden', 'true');
  stick.style.setProperty('--c', color);
  document.body.append(stick);
  const lift = -Math.max(54, Math.abs(to.x - from.x) * 0.35 + 40);
  const at = (p: Point, turn: number, scale: number) => `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${turn}deg) scale(${scale})`;
  const middle = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) + lift };
  const gone = () => stick.remove();
  return stick
    .animate(
      [
        { transform: at(from, 0, 0.55), opacity: 0.4, easing: 'cubic-bezier(0.3, 0.7, 0.6, 1)' },
        { transform: at(middle, spin * 0.55, 1.15), opacity: 1, offset: 0.5, easing: 'cubic-bezier(0.4, 0, 0.8, 0.5)' },
        { transform: at(to, spin, 1), opacity: 1 },
      ],
      { duration: ms, fill: 'forwards' },
    )
    .finished.then(gone, gone);
}

export default function PlumpsGame({ players, settings, onExit }: GameProps<PlumpsSettings>) {
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const byId = useMemo(() => new Map<string, Player>(players.map((p) => [p.id, p])), [players]);
  const calm = useMemo(prefersReducedMotion, []);

  const [starter, setStarter] = useState(() => pickStarter(players.length, null));
  const [phase, setPhase] = useState<Phase>('starter');
  const [game, setGame] = useState<PlumpsState>(() => newGame(ids, settings.sticks, starter));
  const truth = useRef(game);
  /** The faces the dice show, and how often they were rolled (every roll makes them tumble). */
  const [faces, setFaces] = useState({ number: 1, color: 3 });
  const [rolls, setRolls] = useState(0);
  const [options, setOptions] = useState<number[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [note, setNote] = useState<{ text: string; tone: Tone }>({ text: '', tone: 'calm' });
  const [leaving, setLeaving] = useState<number | null>(null);
  const [sinking, setSinking] = useState<{ color: string; key: number } | null>(null);
  const [burst, setBurst] = useState(0);
  const [flash, setFlash] = useState(0);
  const [got, setGot] = useState(0);

  const root = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const current = byId.get(game.order[game.turn]!)!;
  const sticks = game.hands[current.id] ?? 0;
  const winners = useMemo(() => (phase === 'over' && game.winner ? [game.winner] : null), [phase, game.winner]);
  useReportScores(NO_POINTS, winners);

  /** With «reduced motion» nothing flies, so nothing has to be waited for long. */
  const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, calm ? Math.min(ms, 80) : ms));

  const centreOf = (selector: string): Point | null => {
    const box = root.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  };
  const handOf = (id: string): Point => centreOf(`[data-hand="${id}"] i:last-of-type`) ?? centreOf(`[data-hand="${id}"]`) ?? centreOf(`[data-player="${id}"]`) ?? { x: window.innerWidth / 2, y: 120 };
  const holeAt = (hole: number, lift: number): Point => {
    const p = centreOf(`[data-hole="${hole}"]`) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: p.x, y: p.y - lift };
  };

  /** How a hole is called with the dice of this game. */
  const called = (hole: number): string => (settings.dice === 'farben' ? HOLES[hole - 1]!.name : `Loch ${hole}`);

  const throwDice = async () => {
    if (phase !== 'roll' && phase !== 'decide') return;
    setPhase('rolling');
    setTarget(null);
    setNote({ text: '', tone: 'calm' });
    const roll: Roll = rollDice(settings.dice);
    setFaces((before) => ({ number: roll.number ?? before.number, color: roll.color ?? before.color }));
    setRolls((n) => n + 1);
    rattle(ROLL_MS / 1000 - 0.1);
    haptic([8, 40, 8, 60, 8]);
    await wait(ROLL_MS);
    if (!alive.current) return;
    land();
    haptic(18);
    const { holes, double } = holesOf(roll);
    if (double) {
      // Number and colour name the same hole: straight into the box.
      setFlash((n) => n + 1);
      setTarget(DROP);
      doubleHit();
      haptic([20, 40, 20, 40, 70]);
      setNote({ text: 'Doppeltreffer! Zahl und Farbe zeigen aufs gleiche Loch.', tone: 'wow' });
      await wait(950);
      if (alive.current) void settle(holes[0]!, true);
    } else if (holes.length === 2) {
      setOptions(holes);
      setPhase('choose');
      setNote({ text: 'Zahl oder Farbe – was soll gelten?', tone: 'calm' });
    } else {
      setTarget(holes[0]!);
      await wait(280);
      if (alive.current) void settle(holes[0]!, false);
    }
  };

  /** The roll (or the choice) is made: the stick moves, then it is clear how the game goes on. */
  const settle = async (hole: number, double: boolean) => {
    setPhase('moving');
    setOptions([]);
    setTarget(double ? DROP : hole);
    const move = play(truth.current, hole, double);
    truth.current = move.state;
    const me = byId.get(move.player)!;

    if (move.outcome === 'taken') {
      setNote({ text: `Besetzt! ${me.name} muss das Stäbchen nehmen.`, tone: 'bad' });
      stickOut();
      haptic([30, 50, 30]);
      setLeaving(hole);
      await wait(260);
      if (!alive.current) return;
      const out = holeAt(hole, 44);
      setLeaving(null);
      setGame((shown) => ({ ...shown, holes: shown.holes.map((owner, i) => (i === hole - 1 ? null : owner)) }));
      await fly(out, handOf(me.id), byId.get(move.from ?? '')?.color ?? me.color, 430, -200);
      if (!alive.current) return;
      setGame(move.state);
      setGot((n) => n + 1);
    } else {
      // The stick leaves the hand first …
      const hand = handOf(me.id);
      setGame((shown) => ({ ...shown, hands: { ...shown.hands, [me.id]: Math.max(0, (shown.hands[me.id] ?? 1) - 1) } }));
      if (move.outcome === 'placed') {
        await fly(hand, holeAt(hole, 58), me.color, 400, 180);
        if (!alive.current) return;
        setGame(move.state);
        stickIn();
        haptic(16);
        setNote({ text: `${called(hole)} ist frei – Stäbchen rein!`, tone: 'good' });
        await wait(340);
      } else {
        // … and into the open hole it goes: plumps.
        await fly(hand, holeAt(DROP, 82), me.color, 420, 360);
        if (!alive.current) return;
        setSinking({ color: me.color, key: Date.now() });
        plump();
        await wait(430);
        if (!alive.current) return;
        setSinking(null);
        setGame(move.state);
        setBurst((n) => n + 1);
        haptic([20, 40, 70]);
        if (!calm) {
          board.current?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(7px) scale(1.02, 0.97)', offset: 0.25 }, { transform: 'translateY(-4px)', offset: 0.55 }, { transform: 'translateY(0)' }], {
            duration: 420,
            easing: 'ease-out',
          });
        }
        const spot = holeAt(DROP, 0);
        confetti({ x: spot.x, y: spot.y, count: double ? 120 : 46, spread: Math.PI * 0.9 });
        setNote({ text: double ? 'Doppeltreffer – plumps, weg ist es!' : 'Plumps – weg ist es!', tone: 'wow' });
        await wait(440);
      }
    }
    if (!alive.current) return;

    const next = afterMove(move, settings.again);
    if (next === 'over') {
      void celebrate();
      return;
    }
    if (move.outcome !== 'taken' && move.state.hands[me.id] === 1) lastStick();
    if (next === 'again') {
      setNote((before) => ({ text: `${before.text} ${me.name} würfelt nochmals!`, tone: before.tone }));
      setPhase('roll');
    } else if (next === 'choice') {
      setPhase('decide');
    } else {
      await wait(move.outcome === 'taken' ? 950 : 700);
      if (alive.current) handOver();
    }
  };

  const handOver = () => {
    truth.current = pass(truth.current);
    setGame(truth.current);
    setTarget(null);
    setNote({ text: '', tone: 'calm' });
    setPhase('roll');
    sound.whoosh();
    haptic(6);
  };

  /** The last stick is gone: the box celebrates before the ranking shows. */
  const celebrate = async () => {
    setPhase('won');
    setTarget(null);
    setNote({ text: 'Alle Stäbchen sind weg!', tone: 'wow' });
    sound.fanfare();
    haptic([40, 60, 40, 60, 120]);
    const spot = holeAt(DROP, 0);
    confetti({ x: spot.x, y: spot.y, count: 180, spread: Math.PI });
    await wait(600);
    if (!alive.current) return;
    confetti({ count: 160 });
    sound.sparkle();
    await wait(1500);
    if (alive.current) setPhase('over');
  };

  /** Another game with the same people: the next one starts. */
  const again = () => {
    nextGame();
    const first = (starter + 1) % players.length;
    setStarter(first);
    truth.current = newGame(ids, settings.sticks, first);
    setGame(truth.current);
    setOptions([]);
    setTarget(null);
    setNote({ text: `${players[first]!.name} beginnt.`, tone: 'calm' });
    setPhase('roll');
    sound.whoosh();
  };

  const standings = (
    <ol className="score-list">
      {ranking(game).map((entry, i, all) => {
        const person = byId.get(entry.id)!;
        // Same number of sticks, same place.
        const place = all.findIndex((other) => other.sticks === entry.sticks);
        return (
          <li key={entry.id} className={`score-list__item ${entry.sticks === 0 ? 'is-leader' : ''}`} style={{ '--c': person.color, animationDelay: `${i * 50}ms` } as CSSProperties}>
            <span className="score-list__pos">{phase === 'over' && place < 3 ? MEDALS[place] : `${place + 1}.`}</span>
            <span className="team-dot" />
            <span className="score-list__name">{person.name}</span>
            <span className="score-list__score">
              {entry.sticks} <small>Stäbchen</small>
            </span>
          </li>
        );
      })}
    </ol>
  );

  if (phase === 'starter') {
    return (
      <GameShell label="Plumps!" onExit={onExit} accent="#ffb02e" confirmExit={false}>
        <Stage>
          <p className="gs-eyebrow">Wer beginnt?</p>
          <StarterRoulette players={players} targetIndex={starter} onDone={() => setPhase('roll')} />
        </Stage>
      </GameShell>
    );
  }

  if (phase === 'over') {
    const winner = byId.get(game.winner ?? '') ?? current;
    return (
      <GameShell label="Schlussrangliste" onExit={onExit} accent={winner.color} confirmExit={false}>
        <Stage>
          <div className="result-banner">
            <span className="plumps-winner">
              <span className="plumps-winner__crown" aria-hidden="true">
                👑
              </span>
              <Avatar name={winner.name} color={winner.color} size={92} />
            </span>
            <Headline small>{winner.name} gewinnt!</Headline>
            <p className="gs-text">
              Alle Stäbchen sind weg – {game.box === 1 ? 'eines liegt' : `${game.box} liegen`} in der Kiste.
            </p>
          </div>
          {standings}
          <Actions>
            <Button size="lg" block icon="refresh" onClick={again}>
              Nochmal
            </Button>
            <Button variant="ghost" block onClick={onExit}>
              Beenden
            </Button>
          </Actions>
        </Stage>
      </GameShell>
    );
  }

  const canRoll = phase === 'roll' || phase === 'decide';
  const both = settings.dice === 'beide';
  const hint = phase === 'roll' ? (both ? 'Tippe auf die Würfel' : 'Tippe auf den Würfel') : phase === 'decide' ? 'Nochmals würfeln – oder aufhören?' : '';

  /** What choosing a hole would do – said on the two buttons when both dice were rolled. */
  const effect = (hole: number): string => (hole === DROP ? 'ab in die Kiste' : game.holes[hole - 1] === null ? 'frei' : 'besetzt');

  return (
    <GameShell label="Plumps!" onExit={onExit} accent={current.color} scoreboard={standings} exitContent={standings}>
      <div ref={root} className={`plumps plumps--${phase}`} style={{ '--me': current.color } as CSSProperties}>
        <ul className="plumps-players" aria-label="Stäbchen der Mitspielenden" style={{ '--n': players.length } as CSSProperties}>
          {players.map((person) => {
            const left = game.hands[person.id] ?? 0;
            return (
              <li key={person.id} data-player={person.id} className={`plumps-player ${person.id === current.id ? 'is-on' : ''} ${left === 1 ? 'is-last' : ''}`}>
                <Avatar name={person.name} color={person.color} size={34} />
                <span className="plumps-player__count" aria-hidden="true">
                  {left}
                </span>
                <span className="sr-only">
                  {person.name}: {left} Stäbchen
                </span>
              </li>
            );
          })}
        </ul>

        <div className="plumps-turn">
          <p className="plumps-turn__who">
            <strong>{current.name}</strong> {phase === 'won' ? 'gewinnt!' : 'ist dran'}
            {sticks === 1 && phase !== 'won' && <span className="plumps-turn__last">Letztes Stäbchen!</span>}
          </p>
          {/* Keyed by the sticks taken: the hand shakes when one comes back. */}
          <div key={got} className={`plumps-hand ${got > 0 ? 'is-shaken' : ''}`} data-hand={current.id} aria-hidden="true">
            {Array.from({ length: Math.min(sticks, 12) }, (_, i) => (
              <i key={i} />
            ))}
            {sticks > 12 && <b>+{sticks - 12}</b>}
          </div>
          <p className={`plumps-note is-${note.tone}`} role="status" aria-live="polite">
            {note.text}
          </p>
        </div>

        {/* The board takes the room that is left between the turn and the dice, whatever the phone. */}
        <div className="plumps-stage">
        <div ref={board} className={`plumps-board ${phase === 'won' ? 'is-won' : ''}`}>
          <div className="plumps-front">
            <span className="plumps-front__plate">
              {/* Keyed by the number: it jumps when a stick falls in. */}
              <b key={game.box}>{game.box}</b> in der Kiste
            </span>
          </div>
          <div className="plumps-lid" />
          {HOLES.map((hole) => {
            const spot = SPOTS[hole.n]!;
            const open = hole.n === DROP;
            const owner = open ? undefined : byId.get(game.holes[hole.n - 1] ?? '');
            const option = phase === 'choose' && options.includes(hole.n);
            return (
              <button
                key={hole.n}
                type="button"
                data-hole={hole.n}
                className={`plumps-slot plumps-slot--${hole.n} ${open ? 'plumps-slot--open' : ''} ${option ? 'is-option' : ''} ${target === hole.n ? 'is-target' : ''}`}
                style={{ left: `${spot.x}%`, top: `${spot.y}%`, zIndex: spot.row, '--c': hole.color } as CSSProperties}
                disabled={!option}
                onClick={() => void settle(hole.n, false)}
                aria-label={`Loch ${hole.n}, ${hole.name}: ${open ? 'offen, hier fällt das Stäbchen in die Kiste' : owner ? `besetzt von ${owner.name}` : 'frei'}`}
              >
                <span className="plumps-slot__hole" />
                {/* Somebody lives in the box: two eyes in the dark, happy whenever a stick falls in. */}
                {open && (
                  <span key={burst} className={`plumps-eyes ${burst > 0 ? 'is-fed' : ''} ${sinking ? 'is-waiting' : ''}`} aria-hidden="true">
                    <i />
                    <i />
                  </span>
                )}
                {owner && (
                  <span className={`plumps-stick ${leaving === hole.n ? 'is-leaving' : ''}`} style={{ '--c': owner.color } as CSSProperties}>
                    <i />
                  </span>
                )}
                {open && sinking && (
                  <span key={sinking.key} className="plumps-stick is-sinking" style={{ '--c': sinking.color } as CSSProperties}>
                    <i />
                  </span>
                )}
                <span className="plumps-slot__rim" />
                <span className="plumps-slot__n">{hole.n}</span>
              </button>
            );
          })}
          {burst > 0 && <span key={burst} className="plumps-burst" style={{ left: `${SPOTS[DROP]!.x}%`, top: `${SPOTS[DROP]!.y}%` }} />}
        </div>
        </div>

        <div className="plumps-tray">
          <button type="button" className="plumps-dice" onClick={() => void throwDice()} disabled={!canRoll} aria-label={both ? 'Beide Würfel werfen' : 'Würfeln'}>
            {settings.dice !== 'farben' && <Die kind="zahl" value={faces.number} rolls={rolls} />}
            {settings.dice !== 'zahlen' && <Die kind="farbe" value={faces.color} rolls={rolls} />}
          </button>

          {phase === 'choose' ? (
            <div className="plumps-choice" role="group" aria-label="Zahl oder Farbe">
              {options.map((hole, i) => (
                <button key={hole} type="button" className="plumps-pick" style={{ '--c': HOLES[hole - 1]!.color } as CSSProperties} onClick={() => void settle(hole, false)}>
                  <span className="plumps-pick__dot" aria-hidden="true" />
                  <span className="plumps-pick__what">{i === 0 ? `Zahl ${hole}` : HOLES[hole - 1]!.name}</span>
                  <small>{effect(hole)}</small>
                </button>
              ))}
            </div>
          ) : phase === 'decide' ? (
            <div className="plumps-choice">
              <Button icon="refresh" onClick={() => void throwDice()}>
                Nochmals
              </Button>
              <Button variant="secondary" onClick={handOver}>
                Weitergeben
              </Button>
            </div>
          ) : (
            <p className="plumps-tray__hint">{hint}</p>
          )}
        </div>
      </div>
      {flash > 0 && (
        <div key={flash} className="plumps-flash" aria-hidden="true">
          <span>Doppeltreffer!</span>
        </div>
      )}
    </GameShell>
  );
}
