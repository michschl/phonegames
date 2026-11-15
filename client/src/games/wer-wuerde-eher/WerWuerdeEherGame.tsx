import { useMemo, useRef, useState } from 'react';
import type { GameProps } from '../types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, PromptCard, Stage } from '../shared/GameShell.tsx';
import { filterPacks, type PackSettings } from '../shared/packs.tsx';
import { PlayerPicker, playerScores, ScoreList } from '../shared/players.tsx';
import { QUESTIONS, type PromptCard as Card } from './questions.ts';

type Phase = 'question' | 'countdown' | 'point' | 'chosen';

const PACK_LABEL: Record<string, string> = { familie: '👨‍👩‍👧 Familie', freunde: '🙌 Freunde', party: '🎉 Party' };

export default function WerWuerdeEherGame({ players, settings, onExit }: GameProps<PackSettings>) {
  const pool = useMemo(() => filterPacks(QUESTIONS, settings.packs), [settings.packs]);
  const used = useRef(new Set<string>());
  const draw = () => {
    const card = drawFresh('wer-wuerde-eher', pool, (c) => c.id, { exclude: used.current });
    used.current.add(card.id);
    return card;
  };
  const [card, setCard] = useState<Card>(draw);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [countdown, setCountdown] = useState(3);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tally, setTally] = useState<Record<string, number>>({});
  const ranking = <ScoreList entries={playerScores(players, tally)} unit="×" />;

  const point = () => {
    sound.unlock();
    setPhase('countdown');
    const stop = sound.drumroll();
    let n = 3;
    setCountdown(n);
    const id = window.setInterval(() => {
      n -= 1;
      haptic(10);
      if (n > 0) setCountdown(n);
      else {
        window.clearInterval(id);
        stop();
        haptic([40, 30, 80]);
        setPhase('point');
      }
    }, 750);
  };

  const pick = (id: string) => {
    setChosen(id);
    setTally((t) => ({ ...t, [id]: (t[id] ?? 0) + 1 }));
    sound.reveal();
    setPhase('chosen');
  };

  const next = () => {
    sound.whoosh();
    setCard(draw());
    setCount((c) => c + 1);
    setChosen(null);
    setPhase('question');
  };

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? '';

  return (
    <GameShell label={`Frage ${count + 1}`} onExit={onExit} accent="#ff7ae0" scoreboard={ranking} exitContent={count > 0 ? ranking : undefined}>
      <Stage>
        <PromptCard cardKey={card.id} eyebrow={PACK_LABEL[card.pack]} tone="#ff7ae0">
          {card.text}
        </PromptCard>

        {phase === 'question' && (
          <Actions>
            <Button size="lg" block onClick={point}>
              3 – 2 – 1 – zeigen!
            </Button>
            <Button variant="ghost" block onClick={next}>
              Andere Frage
            </Button>
          </Actions>
        )}

        {phase === 'countdown' && (
          <div className="countdown-overlay">
            <span key={countdown}>{countdown}</span>
          </div>
        )}

        {phase === 'point' && (
          <>
            <p className="gs-headline gs-headline--small">👉 Jetzt zeigen!</p>
            <p className="gs-text">Auf wen zeigen die meisten Finger?</p>
            <PlayerPicker players={players} onSelect={(p) => pick(p.id)} />
            <Actions>
              <Button variant="ghost" block onClick={next}>
                Unentschieden – weiter
              </Button>
            </Actions>
          </>
        )}

        {phase === 'chosen' && (
          <>
            <div className="result-banner">
              <span className="result-banner__title">{nameOf(chosen)}!</span>
            </div>
            <p className="gs-text">
              Schon {tally[chosen!] ?? 0}× gewählt {(tally[chosen!] ?? 0) >= 3 ? '– das ist wohl ein Titel 👑' : ''}
            </p>
            <Actions>
              <Button size="lg" block onClick={next}>
                Nächste Frage
              </Button>
            </Actions>
          </>
        )}
      </Stage>
    </GameShell>
  );
}
