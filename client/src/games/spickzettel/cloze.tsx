import type { LearnCard } from '../../../../shared/types.ts';
import { splitGap } from '../../lib/learn.ts';

/** The question of a card – for a Lückentext the sentence with its gap, or with the answer filled in. */
export function CardPrompt({ card, fill = false }: { card: LearnCard; fill?: boolean }) {
  const parts = card.kind === 'cloze' ? splitGap(card.prompt) : null;
  if (!parts) return <>{card.prompt}</>;
  return (
    <>
      {parts[0]}
      <span className={`cloze-blank ${fill ? 'is-filled' : ''}`}>{fill ? card.answer : <span className="sr-only">Lücke</span>}</span>
      {parts[1]}
    </>
  );
}

/** One line for lists: «Die Aare fliesst durch «Bern».» or «le chien – der Hund». */
export function cardLine(card: LearnCard): string {
  const parts = card.kind === 'cloze' ? splitGap(card.prompt) : null;
  return parts ? `${parts[0]}«${card.answer}»${parts[1]}` : `${card.prompt} – ${card.answer}`;
}
