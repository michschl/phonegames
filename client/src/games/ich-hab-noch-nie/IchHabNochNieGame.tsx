import { useMemo, useRef, useState } from 'react';
import type { GameProps } from '../types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, PromptCard, Stage } from '../shared/GameShell.tsx';
import { filterPacks, type PackSettings } from '../shared/packs.tsx';
import { PlayerPicker, playerScores, ScoreList } from '../shared/players.tsx';
import { STATEMENTS, type PromptCard as Card } from './statements.ts';

const PACK_LABEL: Record<string, string> = { familie: '👨‍👩‍👧 Familie', freunde: '🙌 Freunde', party: '🎉 Party' };

export default function IchHabNochNieGame({ players, settings, onExit }: GameProps<PackSettings>) {
  const pool = useMemo(() => filterPacks(STATEMENTS, settings.packs), [settings.packs]);
  const used = useRef(new Set<string>());
  const draw = () => {
    const card = drawFresh('ich-hab-noch-nie', pool, (c) => c.id, { exclude: used.current });
    used.current.add(card.id);
    return card;
  };
  const [card, setCard] = useState<Card>(draw);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [tally, setTally] = useState<Record<string, number>>({});
  const ranking = (
    <>
      <p className="sheet__text">Wer hat am meisten erlebt?</p>
      <ScoreList entries={playerScores(players, tally)} unit="×" />
    </>
  );

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const next = () => {
    if (selected.length) {
      setTally((t) => {
        const n = { ...t };
        for (const id of selected) n[id] = (n[id] ?? 0) + 1;
        return n;
      });
    }
    sound.whoosh();
    setSelected([]);
    setCard(draw());
    setCount((c) => c + 1);
  };

  const share = selected.length;

  return (
    <GameShell label={`Karte ${count + 1}`} onExit={onExit} accent="#3ddc97" scoreboard={ranking} exitContent={count > 0 ? ranking : undefined}>
      <Stage>
        <PromptCard cardKey={card.id} eyebrow={PACK_LABEL[card.pack]} tone="#3ddc97">
          {card.text}
        </PromptCard>
        <p className="gs-text">
          Wer das schon gemacht hat, steht kurz auf – und tippt sich hier an.
          {share > 0 && (
            <>
              {' '}
              <strong>
                {share} von {players.length}
              </strong>{' '}
              haben schon!
            </>
          )}
        </p>
        <PlayerPicker players={players} selected={selected} onSelect={(p) => toggle(p.id)} badge={(p) => (tally[p.id] ? `${tally[p.id]}×` : '')} />
        <Actions>
          <Button size="lg" block onClick={next}>
            Nächste Karte
          </Button>
        </Actions>
      </Stage>
    </GameShell>
  );
}
