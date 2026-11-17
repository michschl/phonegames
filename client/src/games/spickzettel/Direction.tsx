import type { LearnStack } from '../../../../shared/types.ts';
import { haptic } from '../../lib/device.ts';
import { hasVocabulary, isVocabulary, languageName, type LearnDirection } from '../../lib/learn.ts';
import { useLearnDirection } from '../../store/learners.ts';
import { useSettings } from '../../store/settings.ts';
import { OptionRow } from '../shared/settings.tsx';

/** A short pair of the stack for the explanation – «le chien» → «der Hund». */
function example(stack: LearnStack): [string, string] {
  const cards = stack.cards.filter(isVocabulary);
  const card = cards.find((c) => c.prompt.length + c.answer.length <= 36) ?? cards[0]!;
  return [card.prompt, card.answer];
}

/**
 * «Abfragen»: which side of vocabulary cards is shown – as entered, the other way round, or mixed.
 * Chosen per stack before a round; only shown for stacks with vocabulary.
 */
export function DirectionPicker({ stack }: { stack: LearnStack }) {
  const direction = useLearnDirection(stack.id);
  const setDirection = useSettings((s) => s.setLearnDirection);
  if (!hasVocabulary(stack)) return null;

  const [from, to] = stack.languages.length === 2 ? stack.languages : [];
  const [word, translation] = example(stack);
  const options: { value: LearnDirection; label: string }[] =
    from && to
      ? [
          { value: 'forward', label: `${from.toUpperCase()} → ${to.toUpperCase()}` },
          { value: 'reverse', label: `${to.toUpperCase()} → ${from.toUpperCase()}` },
          { value: 'mixed', label: 'Gemischt' },
        ]
      : [
          { value: 'forward', label: 'Normal' },
          { value: 'reverse', label: 'Umgekehrt' },
          { value: 'mixed', label: 'Gemischt' },
        ];
  const shown = (first: string, second: string) => `«${first}» → «${second}»`;
  const hint =
    direction === 'mixed'
      ? 'Mal so, mal umgekehrt – zufällig gemischt.'
      : from && to
        ? direction === 'forward'
          ? `${languageName(from)} zeigen, auf ${languageName(to)} antworten: ${shown(word, translation)}`
          : `${languageName(to)} zeigen, auf ${languageName(from)} antworten: ${shown(translation, word)}`
        : direction === 'forward'
          ? `Wie erfasst: ${shown(word, translation)}`
          : `Umgekehrt: ${shown(translation, word)}`;

  return (
    <OptionRow
      label="Abfragen"
      value={direction}
      options={options}
      onChange={(value) => {
        haptic(6);
        setDirection(stack.id, value);
      }}
      hint={hint}
    />
  );
}
