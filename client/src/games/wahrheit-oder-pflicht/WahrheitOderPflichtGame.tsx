import { useMemo, useRef, useState } from 'react';
import type { GameProps } from '../types.ts';
import { Button } from '../../components/ui.tsx';
import { StarterRoulette } from '../../components/StarterRoulette.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, Headline, PromptCard, Stage } from '../shared/GameShell.tsx';
import { filterPacks, type PackSettings } from '../shared/packs.tsx';
import { fillPerson, playerScores, ScoreList } from '../shared/players.tsx';
import { pickStarter } from '../bombe/logic.ts';
import { CARDS, type DareCard } from './cards.ts';
import './wahrheit-oder-pflicht.css';
import { useReportScores } from '../shared/results.ts';

type Phase = 'pick' | 'choose' | 'card';
type Kind = DareCard['type'];

export default function WahrheitOderPflichtGame({ players, settings, onExit }: GameProps<PackSettings>) {
  const pool = useMemo(() => filterPacks(CARDS, settings.packs), [settings.packs]);
  const used = useRef(new Set<string>());
  const [round, setRound] = useState(1);
  const [starter, setStarter] = useState(() => pickStarter(players.length, null));
  const [phase, setPhase] = useState<Phase>('pick');
  const [card, setCard] = useState<{ kind: Kind; text: string } | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [chickens, setChickens] = useState<Record<string, number>>({});
  const player = players[starter]!;
  const ranking = <ScoreList entries={playerScores(players, scores)} />;
  useReportScores(scores);

  const take = (kind: Kind) => {
    sound.flip();
    haptic(15);
    const ofKind = pool.filter((c) => c.type === kind);
    const drawn = drawFresh(`wop-${kind}`, ofKind.length ? ofKind : CARDS.filter((c) => c.type === kind), (c) => c.id, {
      exclude: used.current,
    });
    used.current.add(drawn.id);
    setCard({ kind, text: fillPerson(drawn.text, players, player.id) });
    setPhase('card');
  };

  const random = () => {
    // Fate decides: a little magic on top of the card being turned.
    sound.sparkle();
    take(Math.random() < 0.5 ? 'wahrheit' : 'pflicht');
  };

  const resolve = (done: boolean) => {
    if (done) {
      setScores((s) => ({ ...s, [player.id]: (s[player.id] ?? 0) + 1 }));
      sound.coin();
      if (card?.kind === 'pflicht') {
        sound.sparkle();
        confetti({ count: 80 });
      }
    } else {
      setChickens((c) => ({ ...c, [player.id]: (c[player.id] ?? 0) + 1 }));
      sound.wrong();
    }
    setRound((r) => r + 1);
    setStarter((prev) => pickStarter(players.length, prev));
    setCard(null);
    setPhase('pick');
  };

  return (
    <GameShell label={`Runde ${round}`} onExit={onExit} accent="#ff8a3d" scoreboard={ranking} exitContent={round > 1 ? ranking : undefined}>
      {phase === 'pick' && (
        <Stage>
          <p className="gs-eyebrow">Wer ist dran?</p>
          <StarterRoulette key={round} players={players} targetIndex={starter} onDone={() => setPhase('choose')} />
        </Stage>
      )}

      {phase === 'choose' && (
        <Stage>
          <Headline small>{player.name}, Wahrheit oder Pflicht?</Headline>
          {(chickens[player.id] ?? 0) > 0 && <p className="gs-text">🐔 Schon {chickens[player.id]}× gekniffen …</p>}
          <div className="wop-choice">
            <button type="button" className="wop-btn wop-btn--truth" onClick={() => take('wahrheit')}>
              <span aria-hidden="true">🗣️</span>
              Wahrheit
            </button>
            <button type="button" className="wop-btn wop-btn--dare" onClick={() => take('pflicht')}>
              <span aria-hidden="true">🔥</span>
              Pflicht
            </button>
          </div>
          <Actions>
            <Button variant="ghost" block onClick={random}>
              🎲 Das Schicksal soll entscheiden
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'card' && card && (
        <Stage>
          <PromptCard
            cardKey={card.text}
            eyebrow={card.kind === 'wahrheit' ? `🗣️ Wahrheit für ${player.name}` : `🔥 Pflicht für ${player.name}`}
            tone={card.kind === 'wahrheit' ? '#2de2e6' : '#ff8a3d'}
          >
            {card.text}
          </PromptCard>
          <div className="big-buttons">
            <button type="button" className="big-btn big-btn--skip" onClick={() => resolve(false)}>
              <span aria-hidden="true">🐔</span>
              <span>Gekniffen</span>
            </button>
            <button type="button" className="big-btn big-btn--correct" onClick={() => resolve(true)}>
              <span aria-hidden="true">✓</span>
              <span>Geschafft</span>
            </button>
          </div>
        </Stage>
      )}
    </GameShell>
  );
}
