import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LearnCard, LearnProgress, LearnStack, Player } from '../../../../shared/types.ts';
import { Button } from '../../components/ui.tsx';
import { CoinGain } from '../../components/Coins.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { checkTypedAnswer, clozeCards, isDue, progressId, splitGap } from '../../lib/learn.ts';
import { normalize, shuffle } from '../../lib/util.ts';
import { useData, useRewards, useProgress } from '../../store/data.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PlayerPicker } from '../shared/players.tsx';
import { cardLine } from './cloze.tsx';
import type { SpickzettelSettings } from './index.tsx';
import { useKastenTiles } from './status.ts';

type Phase = 'who' | 'page' | 'done';
type GapState = 'right' | 'almost' | 'wrong';

/** Sentences per page – about what fits on a phone without scrolling. */
const PAGE_SIZE = 5;
/** Gaps per round; longer texts start where the first card is due. */
const MAX_GAPS = 30;

/** The text split into pages of (almost) equal length, in the order of the text. */
function makePages(cards: LearnCard[], progress: LearnProgress | undefined): LearnCard[][] {
  let list = cards;
  if (cards.length > MAX_GAPS) {
    const start = Math.max(0, cards.findIndex((card) => isDue(progress?.cards[card.id])));
    list = [...cards.slice(start), ...cards.slice(0, start)].slice(0, MAX_GAPS);
  }
  const count = Math.ceil(list.length / PAGE_SIZE);
  const size = Math.ceil(list.length / count);
  const pages: LearnCard[][] = [];
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size));
  return pages;
}

interface BankWord {
  key: string;
  word: string;
}

/** The missing words of a page plus up to two wrong ones, shuffled. */
function makeBank(page: LearnCard[]): BankWord[] {
  const answers = page.map((card) => ({ key: card.id, word: card.answer }));
  const taken = new Set(page.flatMap((card) => [card.answer, ...card.accepted]).map((w) => normalize(w)));
  const extra: BankWord[] = [];
  for (const word of shuffle(page.flatMap((card) => card.distractors))) {
    if (extra.length >= 2 || taken.has(normalize(word))) continue;
    taken.add(normalize(word));
    extra.push({ key: `extra-${extra.length}`, word });
  }
  return shuffle([...answers, ...extra]);
}

const isRight = (card: LearnCard, word: string) => [card.answer, ...card.accepted].some((a) => normalize(a) === normalize(word));

/**
 * Lückentext: the stack's Lückentext cards as a text, page by page. Words come from a word
 * bank or are typed. Missed gaps go back to box 1 of the person's Kartenkasten.
 */
export function Lueckentext({
  stack,
  players,
  settings,
  onExit,
}: {
  stack: LearnStack;
  players: Player[];
  settings: SpickzettelSettings;
  onExit: () => void;
}) {
  const [learner, setLearner] = useState<Player | null>(players.length === 1 ? players[0]! : null);
  const progress = useProgress(stack.id, learner?.name);
  const recordAnswer = useData((s) => s.recordAnswer);
  const rewards = useRewards();
  const tiles = useKastenTiles(stack.id);
  const typing = settings.clozeInput === 'type';

  const [phase, setPhase] = useState<Phase>(learner ? 'page' : 'who');
  const [pages, setPages] = useState<LearnCard[][]>(() => makePages(clozeCards(stack), progress));
  const [pageIndex, setPageIndex] = useState(0);
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, GapState> | null>(null);
  const [results, setResults] = useState<{ card: LearnCard; right: boolean }[]>([]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const page = pages[pageIndex] ?? [];
  const bank = useMemo(() => makeBank(page), [page]);
  const wordOf = (cardId: string) => bank.find((b) => b.key === placed[cardId])?.word;
  const firstEmpty = (state: Record<string, string>) => page.find((card) => !state[card.id])?.id ?? null;
  const current = active && !placed[active] ? active : firstEmpty(placed);
  const missing = page.filter((card) => !placed[card.id]).length;
  const right = results.filter((r) => r.right).length;

  useEffect(() => {
    if (phase !== 'done' || results.length === 0) return;
    if (right / results.length >= 0.8) {
      sound.fanfare();
      confetti({ count: 160 });
    } else {
      sound.ding();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (player: Player | null = learner) => {
    const entry = player ? useData.getState().progress[progressId(stack.id, player.name)] : undefined;
    setPages(makePages(clozeCards(stack), entry && !entry.deleted ? entry : undefined));
    setPageIndex(0);
    resetPage();
    setResults([]);
    setPhase('page');
    sound.swirl();
  };

  function resetPage() {
    setPlaced({});
    setTyped({});
    setActive(null);
    setChecked(null);
  }

  const tapWord = (item: BankWord) => {
    if (checked || !current) return;
    const next = { ...placed, [current]: item.key };
    setPlaced(next);
    setActive(firstEmpty(next));
    sound.pluck();
    haptic(8);
  };

  const tapGap = (card: LearnCard) => {
    if (checked) return;
    if (placed[card.id]) {
      const next = { ...placed };
      delete next[card.id];
      setPlaced(next);
      sound.unpluck();
    }
    setActive(card.id);
    haptic(6);
  };

  const check = () => {
    if (checked || !learner) return;
    const state: Record<string, GapState> = {};
    for (const card of page) {
      if (typing) {
        const verdict = checkTypedAnswer(typed[card.id] ?? '', card).verdict;
        state[card.id] = verdict;
      } else {
        state[card.id] = isRight(card, wordOf(card.id) ?? '') ? 'right' : 'wrong';
      }
    }
    const wrong = page.filter((card) => state[card.id] === 'wrong');
    for (const card of wrong) recordAnswer(stack.id, learner.name, card.id, false);
    setResults((r) => [...r, ...page.map((card) => ({ card, right: state[card.id] !== 'wrong' }))]);
    setChecked(state);
    if (wrong.length === 0) {
      sound.correct();
      sound.sparkle();
      haptic(15);
    } else {
      sound.wrong();
      haptic([30, 40, 30]);
    }
  };

  const nextPage = () => {
    if (pageIndex + 1 >= pages.length) {
      setPhase('done');
      return;
    }
    sound.flip();
    setPageIndex(pageIndex + 1);
    resetPage();
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const next = page[index + 1];
    if (next) inputs.current[next.id]?.focus();
    else check();
  };

  const gap = (card: LearnCard, index: number) => {
    const state = checked?.[card.id];
    const fix = state && state !== 'right' && (
      <span className="cloze-fix" aria-label={`richtig: ${card.answer}`}>
        {card.answer}
      </span>
    );
    if (typing) {
      const value = typed[card.id] ?? '';
      return (
        <>
          <input
            ref={(el) => {
              inputs.current[card.id] = el;
            }}
            className={`cloze-input ${state ? `is-${state}` : ''}`}
            style={{ width: `${Math.min(16, Math.max(6, value.length + 2))}ch` }}
            value={value}
            onChange={(e) => setTyped((t) => ({ ...t, [card.id]: e.target.value }))}
            onKeyDown={(e) => onKey(e, index)}
            readOnly={!!checked}
            aria-label={`Lücke ${index + 1}`}
            autoFocus={index === 0}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint={index + 1 < page.length ? 'next' : 'done'}
            lang={stack.languages[1] || 'de'}
            maxLength={120}
          />
          {fix}
        </>
      );
    }
    const word = wordOf(card.id);
    return (
      <>
        <button
          type="button"
          className={`cloze-gap ${word ? 'is-filled' : ''} ${!checked && current === card.id ? 'is-active' : ''} ${state ? `is-${state}` : ''}`}
          aria-label={`Lücke ${index + 1}: ${word ?? 'leer'}`}
          aria-pressed={!checked && current === card.id}
          disabled={!!checked}
          onClick={() => tapGap(card)}
        >
          {word ?? <span aria-hidden="true">{index + 1}</span>}
        </button>
        {fix}
      </>
    );
  };

  const label = phase === 'who' ? 'Lückentext' : phase === 'page' ? `Seite ${pageIndex + 1} von ${pages.length}` : stack.title;

  return (
    <GameShell label={label} onExit={onExit} accent="#4d7cff" confirmExit={phase === 'page' && (pageIndex > 0 || !!checked)}>
      {phase === 'who' && (
        <Stage>
          <p className="gs-eyebrow">{stack.title}</p>
          <Headline small>Wer löst den Lückentext?</Headline>
          <p className="gs-text">Fehler landen im eigenen Kartenkasten.</p>
          <PlayerPicker
            players={players}
            status={(player) => tiles?.(player)}
            selected={learner?.id ?? null}
            onSelect={(player) => {
              setLearner(player);
              start(player);
            }}
          />
        </Stage>
      )}

      {phase === 'page' && (
        <Stage className="cloze-stage">
          <div key={pageIndex} className="cloze-sheet">
            <p className="cloze-text">
              {page.map((card, index) => {
                const [before, after] = splitGap(card.prompt) ?? [card.prompt, ''];
                return (
                  <span key={card.id} className="cloze-sentence">
                    {before}
                    {gap(card, index)}
                    {after}{' '}
                  </span>
                );
              })}
            </p>
          </div>

          {!typing && !checked && (
            <div className="word-bank" role="group" aria-label="Wortbank">
              {bank.map((item) => {
                const used = Object.values(placed).includes(item.key);
                return (
                  <button key={item.key} type="button" className="word-chip" disabled={used} onClick={() => tapWord(item)}>
                    {item.word}
                  </button>
                );
              })}
            </div>
          )}

          {checked && (
            <p className="gs-text" role="status">
              {page.filter((card) => checked[card.id] !== 'wrong').length} von {page.length} richtig
              {page.some((card) => checked[card.id] === 'almost') && ' – achte auf die Schreibweise'}
            </p>
          )}

          <Actions>
            {checked ? (
              <Button size="lg" block onClick={nextPage}>
                {pageIndex + 1 >= pages.length ? 'Zum Ergebnis' : 'Nächste Seite'}
              </Button>
            ) : (
              <Button size="lg" block icon="check" onClick={check} disabled={!typing && missing > 0}>
                {!typing && missing > 0 ? `Noch ${missing} ${missing === 1 ? 'Lücke' : 'Lücken'}` : 'Prüfen'}
              </Button>
            )}
          </Actions>
        </Stage>
      )}

      {phase === 'done' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              {right / Math.max(1, results.length) >= 0.8 ? '🎉' : '💪'}
            </span>
            <span className="result-banner__title">
              {right} von {results.length} Lücken
            </span>
          </div>
          <CoinGain learner={learner?.name} amount={right * rewards.perCard} reason={`Lückentext «${stack.title}»`} />
          {results.some((r) => !r.right) ? (
            <>
              <p className="gs-text">Diese Lücken sind zurück im Kartenkasten (Fach 1) – zum Üben:</p>
              <ul className="turn-list">
                {results
                  .filter((r) => !r.right)
                  .map(({ card }) => (
                    <li key={card.id} className="is-skipped">
                      <span>↺</span>
                      <span>{cardLine(card)}</span>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="gs-text">Alles richtig – stark! 🎉</p>
          )}
          <Actions>
            <Button size="lg" block icon="refresh" onClick={() => start()}>
              Nochmal
            </Button>
            {players.length > 1 && (
              <Button
                variant="ghost"
                block
                icon="users"
                onClick={() => {
                  setLearner(null);
                  setPhase('who');
                }}
              >
                Andere Person
              </Button>
            )}
            <Button variant="ghost" block onClick={onExit}>
              Beenden
            </Button>
          </Actions>
        </Stage>
      )}
    </GameShell>
  );
}
