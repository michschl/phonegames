import { useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { GAP, normalizeGap } from '../../../shared/learn.ts';
import { LIMITS, type LearnCardKind } from '../../../shared/types.ts';
import { Section } from './Layout.tsx';
import { Button, IconButton, TextField } from './ui.tsx';
import { haptic } from '../lib/device.ts';
import type { StackInput } from '../store/data.ts';
import { emptyCard, type EditorCard, type EditorValue } from '../store/learnDraft.ts';
import { withUndo } from '../store/undo.ts';

/** Text area that grows with its content (one line by default). */
function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

/**
 * A sentence with a gap is a Lückentext: «Die Aare fliesst durch [Bern].» without an answer,
 * or a prompt with «___». A Lückentext that lost its gap becomes a normal question.
 */
function withGap(prompt: string, answer: string, kind: LearnCardKind): { prompt: string; answer: string; kind: LearnCardKind } {
  const brackets = prompt.match(/\[([^[\]]{1,80})\]/g);
  if (!answer && brackets?.length === 1) {
    answer = brackets[0]!.slice(1, -1).trim();
    prompt = prompt.replace(brackets[0]!, GAP);
  }
  if (!answer) return { prompt, answer, kind };
  if (kind === 'cloze' || /_{2,}|…|\.{3}/.test(prompt)) {
    const gapped = normalizeGap(prompt, answer);
    if (gapped) return { prompt: gapped, answer, kind: 'cloze' };
    if (kind === 'cloze') return { prompt, answer, kind: 'qa' };
  }
  return { prompt, answer, kind };
}

/** Turns the edited value into what the store saves; returns the index of the first incomplete card instead. */
export function toStackInput(value: EditorValue): StackInput | { incomplete: number } | { empty: true } {
  const cards: StackInput['cards'] = [];
  for (const [index, card] of value.cards.entries()) {
    const { prompt, answer, kind } = withGap(card.prompt.trim(), card.answer.trim(), card.kind);
    if (!prompt && !answer) continue;
    if (!prompt || !answer) return { incomplete: index };
    const sameAnswer = answer === card.originalAnswer.trim();
    cards.push({
      id: card.id,
      kind,
      prompt,
      answer,
      // Alternatives and wrong answers belong to the original answer.
      accepted: sameAnswer ? card.accepted : [],
      distractors: card.distractors.filter((d) => d.trim().toLowerCase() !== answer.toLowerCase()),
    });
  }
  if (cards.length === 0) return { empty: true };
  return {
    title: value.title,
    subject: value.subject,
    languages: value.languages,
    cards,
    suggestedModes: value.suggestedModes,
    source: value.source,
  };
}

/**
 * Title, subject and an editable list of cards. Cards the AI was unsure about
 * are highlighted until they are changed or confirmed.
 */
export function StackEditor({
  value,
  onChange,
  invalidIndex,
}: {
  value: EditorValue;
  onChange: (next: EditorValue) => void;
  /** Card to highlight because prompt or answer is missing. */
  invalidIndex?: number | null;
}) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // The undo of a deleted card goes into the value as it is then, not as it was.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const updateCard = (key: string, patch: Partial<EditorCard>) =>
    onChange({ ...value, cards: value.cards.map((card) => (card.key === key ? { ...card, ...patch } : card)) });
  const removeCard = (key: string) => {
    const index = value.cards.findIndex((card) => card.key === key);
    const removed = value.cards[index];
    haptic(10);
    onChange({ ...value, cards: value.cards.filter((card) => card.key !== key) });
    if (!removed || (!removed.prompt.trim() && !removed.answer.trim())) return;
    withUndo(
      `Karte ${index + 1} gelöscht.`,
      () => {
        const current = latest.current;
        if (current.value.cards.some((card) => card.key === removed.key)) return;
        const cards = [...current.value.cards];
        cards.splice(Math.min(index, cards.length), 0, removed);
        current.onChange({ ...current.value, cards });
      },
      'Karte ist wieder da.',
    );
  };
  const addCard = () => {
    haptic(8);
    const card = emptyCard();
    setFocusKey(card.key);
    onChange({ ...value, cards: [...value.cards, card] });
  };
  const unsure = value.cards.filter((card) => card.uncertain).length;

  return (
    <>
      <Section title="Stapel">
        <div className="form stack-meta">
          <TextField
            label="Titel"
            icon="cards"
            value={value.title}
            maxLength={LIMITS.stackTitleMax}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder="z. B. Unité 5 – Vocabulaire"
          />
          <TextField
            label="Fach"
            icon="text"
            value={value.subject}
            maxLength={40}
            onChange={(e) => onChange({ ...value, subject: e.target.value })}
            placeholder="z. B. Französisch"
          />
        </div>
      </Section>

      <Section
        title={`Karten (${value.cards.length})`}
        action={unsure > 0 ? <span className="card-list__unsure">{unsure} prüfen</span> : undefined}
      >
        <ol className="card-list">
          {value.cards.map((card, index) => (
            <li
              key={card.key}
              className={`card-row ${card.uncertain ? 'is-uncertain' : ''} ${invalidIndex === index ? 'has-error' : ''}`}
              data-index={index}
            >
              <span className="card-row__num" aria-hidden="true">
                {index + 1}
              </span>
              <div className="card-row__fields">
                <AutoTextarea
                  className="card-row__input card-row__prompt"
                  aria-label={`Karte ${index + 1}: Frage`}
                  placeholder="Frage, Wort oder Satz mit ___"
                  value={card.prompt}
                  maxLength={LIMITS.cardText}
                  autoFocus={focusKey === card.key}
                  aria-invalid={invalidIndex === index && !card.prompt.trim()}
                  onChange={(e) => updateCard(card.key, { prompt: e.target.value, uncertain: '' })}
                />
                <AutoTextarea
                  className="card-row__input card-row__answer"
                  aria-label={`Karte ${index + 1}: Antwort`}
                  placeholder="Antwort"
                  value={card.answer}
                  maxLength={LIMITS.cardText}
                  aria-invalid={invalidIndex === index && !card.answer.trim()}
                  onChange={(e) => updateCard(card.key, { answer: e.target.value, uncertain: '' })}
                />
                {card.uncertain && (
                  <p className="card-row__warn">
                    <span>Bitte prüfen: {card.uncertain}</span>
                    <button type="button" onClick={() => updateCard(card.key, { uncertain: '' })}>
                      Passt so
                    </button>
                  </p>
                )}
                {invalidIndex === index && <p className="field__error">Frage und Antwort ausfüllen – oder die Karte löschen.</p>}
              </div>
              <IconButton icon="trash" label={`Karte ${index + 1} löschen`} className="icon-btn--small" onClick={() => removeCard(card.key)} />
            </li>
          ))}
        </ol>
        {value.cards.length < LIMITS.cardsPerStack && (
          <Button variant="secondary" block icon="plus" onClick={addCard}>
            Karte hinzufügen
          </Button>
        )}
      </Section>
    </>
  );
}
