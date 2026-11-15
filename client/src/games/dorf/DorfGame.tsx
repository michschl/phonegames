import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameProps } from '../types.ts';
import { Avatar, Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic, setHapticsEnabled } from '../../lib/device.ts';
import { primeSpeech, speak, stopSpeaking } from '../../lib/speech.ts';
import { pickRandom } from '../../lib/util.ts';
import { useSettings } from '../../store/settings.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PassTurns, SecretReveal } from '../shared/PassTurns.tsx';
import { PlayerPicker } from '../shared/players.tsx';
import { TimerRing, useCountdown } from '../shared/Timer.tsx';
import { assignRoles, resolveNight, ROLES, winner, type DorfSettings, type Role } from './logic.ts';
import './dorf.css';

type Phase = 'roles' | 'dusk' | 'night' | 'day' | 'vote' | 'end';
type NightUi = { kind: 'narrate' } | { kind: 'pick'; role: 'beschuetzer' | 'werwolf' | 'seherin' } | { kind: 'seen'; target: string };

class Cancelled extends Error {}

/*
 * Narration. Deaths are announced by name only – roles stay secret until the
 * game is over, so the village has something to argue about and everyone may
 * lie about their own role.
 */
const LINES = {
  nightfall: [
    'Die Nacht bricht herein. Alle schliessen die Augen …',
    'Es wird dunkel im Dorf. Alle schliessen jetzt die Augen …',
    'Der Mond steigt über die Dächer. Alle schliessen die Augen …',
  ],
  wolvesWake: [
    'Werwölfe, öffnet die Augen. Wählt gemeinsam ein Opfer.',
    'Werwölfe, erwacht! Einigt euch lautlos auf ein Opfer.',
  ],
  death: [
    (name: string) => `Das Dorf erwacht … doch nicht alle. Heute Nacht hat es ${name} erwischt.`,
    (name: string) => `Die Sonne geht auf. Mit Schrecken entdeckt das Dorf: ${name} hat die Nacht nicht überlebt.`,
    (name: string) => `Ein Schrei hallt durchs Dorf! ${name} wurde heute Nacht von den Werwölfen geholt.`,
  ],
  noDeath: [
    'Das Dorf erwacht. Was für ein Glück: Heute Nacht ist niemand gestorben.',
    'Die Sonne geht auf, und alle sind noch da. Die Werwölfe gingen heute leer aus!',
  ],
  discuss: 'Wer von euch ist ein Werwolf? Diskutiert!',
  banish: [
    (name: string) => `Das Dorf hat entschieden: ${name} muss das Dorf verlassen.`,
    (name: string) => `${name} wird aus dem Dorf verbannt.`,
  ],
};

/** Vibration (and tap sounds) would give away who is still alive and choosing at night. */
const restoreHaptics = () => setHapticsEnabled(useSettings.getState().haptics);

export default function DorfGame({ players, settings, onExit }: GameProps<DorfSettings>) {
  const [roles, setRoles] = useState(() => assignRoles(players, settings));
  const [alive, setAlive] = useState<string[]>(() => players.map((p) => p.id));
  const [phase, setPhase] = useState<Phase>('roles');
  const [gameNo, setGameNo] = useState(1);
  const [dayNo, setDayNo] = useState(0);
  const [narration, setNarration] = useState('');
  const [ui, setUi] = useState<NightUi>({ kind: 'narrate' });
  const [pick, setPick] = useState<string | null>(null);
  const [lastDeath, setLastDeath] = useState<string | null>(null);
  const [banished, setBanished] = useState<string | null | undefined>(undefined);
  const [result, setResult] = useState<'wolf' | 'dorf' | null>(null);

  const rolesRef = useRef(roles);
  const aliveRef = useRef(alive);
  const lastProtected = useRef<string | null>(null);
  const waiter = useRef<((value: string | null) => void) | null>(null);
  const cancelled = useRef(false);
  const stopAmbience = useRef<(() => void) | null>(null);
  rolesRef.current = roles;
  aliveRef.current = alive;

  const timer = useCountdown(settings.discussionMinutes * 60, { beepFrom: 10 });
  const nameOf = (id: string | null | undefined) => players.find((p) => p.id === id)?.name ?? '';
  const holder = (role: Role) => players.find((p) => rolesRef.current[p.id] === role);
  const inGame = (role: Role) => Object.values(rolesRef.current).includes(role);
  const isAlive = (id: string | undefined) => !!id && aliveRef.current.includes(id);

  useEffect(
    () => () => {
      cancelled.current = true;
      stopSpeaking();
      stopAmbience.current?.();
      restoreHaptics();
      waiter.current?.(null);
    },
    [],
  );

  /* -------------------------------------------------- narration helpers */

  const check = () => {
    if (cancelled.current) throw new Cancelled();
  };

  const pause = async (ms: number) => {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
    check();
  };

  const waitForTap = () =>
    new Promise<string | null>((resolve) => {
      waiter.current = resolve;
    });

  const say = async (text: string) => {
    check();
    setNarration(text);
    setUi({ kind: 'narrate' });
    if (settings.voice) {
      await speak(text);
      check();
      await pause(500);
    } else {
      await waitForTap();
      check();
    }
  };

  const ask = async (role: 'beschuetzer' | 'werwolf' | 'seherin') => {
    setPick(null);
    setUi({ kind: 'pick', role });
    const choice = await waitForTap();
    check();
    return choice;
  };

  /** A dead role still "wakes up", so nobody can tell it is gone. */
  const fakeTurn = () => pause(4000 + Math.random() * 3000);

  /* ------------------------------------------------------------- night */

  const runNight = async () => {
    try {
      setPhase('night');
      setBanished(undefined);
      setHapticsEnabled(false);
      stopAmbience.current = sound.crickets();
      await say(pickRandom(LINES.nightfall));
      await pause(1500);

      let protectedId: string | null = null;
      if (inGame('beschuetzer')) {
        await say('Beschützer, öffne die Augen. Wen möchtest du heute Nacht beschützen?');
        if (isAlive(holder('beschuetzer')?.id)) protectedId = await ask('beschuetzer');
        else await fakeTurn();
        await say('Beschützer, schliesse die Augen.');
        await pause(1200);
      }

      sound.howl();
      await pause(1200);
      await say(pickRandom(LINES.wolvesWake));
      const victim = await ask('werwolf');
      await say('Werwölfe, schliesst die Augen.');
      await pause(1200);

      if (inGame('seherin')) {
        await say('Seherin, öffne die Augen. Wen möchtest du durchschauen?');
        const seer = holder('seherin');
        if (isAlive(seer?.id)) {
          const target = await ask('seherin');
          if (target) {
            setUi({ kind: 'seen', target });
            await waitForTap();
            check();
          }
        } else {
          await fakeTurn();
        }
        await say('Seherin, schliesse die Augen.');
        await pause(1200);
      }

      stopAmbience.current?.();
      restoreHaptics();
      lastProtected.current = protectedId;
      const dead = resolveNight(victim, protectedId);
      const nextAlive = dead ? aliveRef.current.filter((id) => id !== dead) : aliveRef.current;
      setAlive(nextAlive);
      aliveRef.current = nextAlive;
      setLastDeath(dead);
      setDayNo((n) => n + 1);
      setPhase('day');
      sound.birds();
      if (dead) {
        window.setTimeout(() => sound.sting(), 900);
        haptic([200, 80, 200]);
      } else {
        window.setTimeout(() => sound.sparkle(), 700);
      }

      const morning = dead ? pickRandom(LINES.death)(nameOf(dead)) : pickRandom(LINES.noDeath);
      setNarration(morning);
      if (settings.voice) await speak(`${morning} ${LINES.discuss}`);
      check();
      if (!finishIfWon(nextAlive)) timer.reset();
    } catch (error) {
      if (!(error instanceof Cancelled)) throw error;
    }
  };

  const finishIfWon = (aliveNow: string[]) => {
    const w = winner(rolesRef.current, aliveNow);
    if (!w) return false;
    setResult(w);
    setPhase('end');
    stopAmbience.current?.();
    const text = w === 'dorf' ? 'Alle Werwölfe sind besiegt. Das Dorf gewinnt!' : 'Die Werwölfe haben das Dorf übernommen. Die Werwölfe gewinnen!';
    if (settings.voice) void speak(text);
    if (w === 'dorf') {
      sound.fanfare();
      confetti({ count: 200 });
    } else {
      sound.howl();
      window.setTimeout(() => sound.sting(), 1400);
      haptic([300, 100, 300]);
    }
    return true;
  };

  const confirmPick = () => {
    if (!pick) return;
    waiter.current?.(pick);
  };

  /* --------------------------------------------------------------- day */

  const banish = (id: string | null) => {
    setBanished(id);
    timer.pause();
    if (id) {
      const nextAlive = aliveRef.current.filter((x) => x !== id);
      setAlive(nextAlive);
      aliveRef.current = nextAlive;
      const text = pickRandom(LINES.banish)(nameOf(id));
      setNarration(text);
      if (settings.voice) void speak(text);
      sound.gong();
      haptic([120, 60, 120]);
      if (finishIfWon(nextAlive)) return;
    } else {
      setNarration('Heute wird niemand verbannt.');
      if (settings.voice) void speak('Heute wird niemand verbannt.');
      sound.whoosh();
    }
    setPhase('dusk');
  };

  const newGame = () => {
    const next = assignRoles(players, settings);
    setRoles(next);
    rolesRef.current = next;
    const all = players.map((p) => p.id);
    setAlive(all);
    aliveRef.current = all;
    lastProtected.current = null;
    setDayNo(0);
    setLastDeath(null);
    setBanished(undefined);
    setResult(null);
    setGameNo((n) => n + 1);
    setPhase('roles');
  };

  const alivePlayers = players.filter((p) => alive.includes(p.id));
  const pickOptions = (role: 'beschuetzer' | 'werwolf' | 'seherin') =>
    alivePlayers.filter((p) => {
      if (role === 'werwolf') return roles[p.id] !== 'werwolf';
      if (role === 'seherin') return roles[p.id] !== 'seherin';
      return p.id !== lastProtected.current;
    });

  const villageStatus = (
    <div className="dorf-status">
      {players.map((p) => (
        <span key={p.id} className={`dorf-status__p ${alive.includes(p.id) ? '' : 'is-dead'}`} style={{ '--c': p.color } as CSSProperties}>
          <Avatar name={p.name} color={p.color} size={26} />
          {p.name}
          {!alive.includes(p.id) && ' 👻'}
        </span>
      ))}
    </div>
  );

  const label =
    phase === 'roles' ? 'Rollen verteilen' : phase === 'night' ? '🌙 Nacht' : phase === 'end' ? 'Spielende' : `☀️ Tag ${dayNo || 1}`;

  return (
    <GameShell
      label={label}
      onExit={onExit}
      night={phase === 'night' || phase === 'dusk' || phase === 'roles'}
      accent="#8b5cf6"
      className="dorf"
    >
      {phase === 'roles' && (
        <PassTurns
          key={gameNo}
          players={players}
          hint="Schau dir geheim deine Rolle an."
          onComplete={() => setPhase('dusk')}
          render={(player, done) => {
            const role = roles[player.id]!;
            const pack = players.filter((p) => roles[p.id] === 'werwolf' && p.id !== player.id);
            return (
              <SecretReveal onDone={done}>
                <span className="gs-big-emoji" aria-hidden="true">
                  {ROLES[role].emoji}
                </span>
                <span className="secret-label">Deine Rolle</span>
                <span className="secret-value">{ROLES[role].name}</span>
                <span className="secret-sub">{ROLES[role].text}</span>
                {role === 'werwolf' && pack.length > 0 && (
                  <span className="secret-sub">
                    Dein Rudel: <strong>{pack.map((p) => p.name).join(', ')}</strong>
                  </span>
                )}
              </SecretReveal>
            );
          }}
        />
      )}

      {phase === 'dusk' && (
        <Stage>
          <span className="gs-big-emoji dorf-moon" aria-hidden="true">
            🌙
          </span>
          {banished !== undefined && <p className="gs-text">{narration}</p>}
          <Headline small>{dayNo === 0 ? 'Alle kennen ihre Rolle' : 'Die Sonne geht unter …'}</Headline>
          <p className="gs-text">
            {settings.voice
              ? 'Legt das Handy in die Mitte und dreht den Ton auf. Die Erzählstimme führt durch die Nacht – wer aufgerufen wird, öffnet die Augen und tippt aufs Handy.'
              : 'Die Spielleitung liest die Texte vor und tippt jeweils auf «Weiter».'}
          </p>
          <Actions>
            <Button
              size="lg"
              block
              onClick={() => {
                if (settings.voice) primeSpeech();
                void runNight();
              }}
            >
              Die Nacht beginnt
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'night' && ui.kind === 'narrate' && (
        <Stage>
          <span className="gs-big-emoji dorf-moon" aria-hidden="true">
            🌙
          </span>
          <p className="dorf-narration" key={narration}>
            {narration}
          </p>
          {!settings.voice && (
            <Actions>
              <Button size="lg" block onClick={() => waiter.current?.(null)}>
                Weiter
              </Button>
            </Actions>
          )}
        </Stage>
      )}

      {phase === 'night' && ui.kind === 'pick' && (
        <Stage>
          <span className="gs-big-emoji" aria-hidden="true">
            {ROLES[ui.role].emoji}
          </span>
          <Headline small>
            {ui.role === 'werwolf' ? 'Wen fresst ihr?' : ui.role === 'seherin' ? 'Wen durchschaust du?' : 'Wen beschützt du?'}
          </Headline>
          <PlayerPicker players={pickOptions(ui.role)} selected={pick} onSelect={(p) => setPick(p.id)} quiet />
          <Actions>
            <Button size="lg" block disabled={!pick} onClick={confirmPick}>
              Bestätigen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'night' && ui.kind === 'seen' && (
        <Stage>
          <span className="gs-big-emoji" aria-hidden="true">
            {roles[ui.target] === 'werwolf' ? '🐺' : '✨'}
          </span>
          <Headline small>
            {nameOf(ui.target)} ist {roles[ui.target] === 'werwolf' ? 'ein Werwolf!' : 'kein Werwolf.'}
          </Headline>
          <Actions>
            <Button size="lg" block onClick={() => waiter.current?.(null)}>
              Gesehen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'day' && (
        <Stage>
          <span className="gs-big-emoji" aria-hidden="true">
            {lastDeath ? '⚰️' : '🌅'}
          </span>
          <p className="dorf-narration">{narration}</p>
          <TimerRing remaining={timer.remaining} total={timer.total} size={110} />
          {!timer.running && timer.remaining === timer.total && (
            <Button variant="secondary" onClick={timer.start}>
              Diskussion starten ({settings.discussionMinutes} Min.)
            </Button>
          )}
          {villageStatus}
          <Actions>
            <Button size="lg" block onClick={() => setPhase('vote')}>
              Abstimmen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'vote' && (
        <Stage>
          <p className="gs-eyebrow">Abstimmung</p>
          <Headline small>Wen verbannt das Dorf?</Headline>
          <PlayerPicker players={alivePlayers} selected={pick} onSelect={(p) => setPick(p.id)} />
          <Actions>
            <Button size="lg" block disabled={!pick} onClick={() => banish(pick)}>
              {pick ? `${nameOf(pick)} verbannen` : 'Person wählen'}
            </Button>
            <Button variant="ghost" block onClick={() => banish(null)}>
              Niemand verbannen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'end' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              {result === 'dorf' ? '🏡' : '🐺'}
            </span>
            <span className="result-banner__title">{result === 'dorf' ? 'Das Dorf gewinnt!' : 'Die Werwölfe gewinnen!'}</span>
          </div>
          <ul className="dorf-roles">
            {players.map((p) => (
              <li key={p.id} className={alive.includes(p.id) ? '' : 'is-dead'}>
                <span aria-hidden="true">{ROLES[roles[p.id]!].emoji}</span>
                <strong>{p.name}</strong>
                <span>{ROLES[roles[p.id]!].name}</span>
              </li>
            ))}
          </ul>
          <Actions>
            <Button size="lg" block icon="refresh" onClick={newGame}>
              Neues Spiel
            </Button>
            <Button variant="ghost" block onClick={onExit}>
              Beenden
            </Button>
          </Actions>
        </Stage>
      )}
    </GameShell>
  );
}
