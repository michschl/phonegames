import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../../components/Icon.tsx';
import { Section } from '../../components/Layout.tsx';
import { haptic } from '../../lib/device.ts';
import { clozeCards, estimateCards, MODE_MIN_CARDS, subjectEmoji, suggestedModes } from '../../lib/learn.ts';
import { useDueByStack, useStacks } from '../../store/data.ts';
import type { GameSettingsProps } from '../types.ts';
import type { LearnMode, LearnStack } from '../../../../shared/types.ts';
import type { SpickzettelSettings } from './index.tsx';
import './spickzettel.css';

/** How many stacks are listed on the setup screen – the rest is under «Alle Stapel». */
const SHOWN = 5;

const MODES: { value: LearnMode; emoji: string; label: string; hint: string; text: string }[] = [
  {
    value: 'kasten',
    emoji: '🗂️',
    label: 'Kartenkasten',
    hint: 'allein',
    text: 'Jede Person hat ihren eigenen Kartenkasten. Gewusste Karten kommen seltener, vergessene sofort wieder.',
  },
  {
    value: 'duell',
    emoji: '⚔️',
    label: 'Duell',
    hint: 'zu zweit',
    text: 'Handy zwischen euch, jede Person ihre Bildschirmhälfte: Wer zuerst richtig tippt, punktet. Fehler landen im Kartenkasten.',
  },
  {
    value: 'blitz',
    emoji: '⚡',
    label: 'Blitzrunde',
    hint: 'Teams, ab 4',
    text: 'Zwei Teams. Eine Person liest vor und sieht die Antwort, ihr Team antwortet gegen die Zeit.',
  },
  {
    value: 'schaetzen',
    emoji: '🎯',
    label: 'Schätzrunde',
    hint: 'Zahlen, ab 1',
    text: 'Alle schätzen geheim die Zahl oder Jahreszahl, dann zählt die App hoch. Wer am nächsten liegt, punktet. Weit daneben landet im Kartenkasten.',
  },
  {
    value: 'luecke',
    emoji: '🧩',
    label: 'Lückentext',
    hint: 'allein',
    text: 'Der Text Seite für Seite: Setze die fehlenden Wörter aus der Wortbank ein oder tippe sie. Fehler landen im Kartenkasten.',
  },
];

/** Why a mode does not work with this stack, or null. */
function unavailable(mode: LearnMode, stack: LearnStack | undefined): string | null {
  if (!stack) return null;
  if (mode === 'schaetzen' && estimateCards(stack).length < MODE_MIN_CARDS.schaetzen) return 'keine Zahlen';
  if (mode === 'luecke' && clozeCards(stack).length < MODE_MIN_CARDS.luecke) return 'keine Lücken';
  return null;
}

/** Setup screen: which stack and which kind of game. Shown open, the game cannot start without it. */
export function Prepare({ value, onChange }: GameSettingsProps<SpickzettelSettings>) {
  const stacks = useStacks();
  const dueByStack = useDueByStack();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('stapel');
  const wantedMode = params.get('modus');
  const selected = stacks.find((s) => s.id === value.stackId);
  const suggested = selected ? suggestedModes(selected) : new Set<LearnMode>();

  // A stack that was just created or edited comes in as ?stapel=…; otherwise keep a valid choice.
  useEffect(() => {
    if (wanted && stacks.some((s) => s.id === wanted)) {
      const mode = MODES.find((m) => m.value === wantedMode)?.value ?? value.mode;
      if (value.stackId !== wanted || value.mode !== mode) onChange({ ...value, stackId: wanted, mode });
      setParams({}, { replace: true });
    } else if (!selected && stacks.length > 0) {
      onChange({ ...value, stackId: stacks[0]!.id });
    }
  }, [wanted, stacks, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = stacks.slice(0, SHOWN);
  if (selected && !shown.includes(selected)) shown[SHOWN - 1] = selected;

  return (
    <>
      <Section
        title="Lernstapel"
        action={
          stacks.length > 0 && (
            <Link to="/stapel" className="section__link" viewTransition>
              Alle Stapel
            </Link>
          )
        }
      >
        {stacks.length === 0 ? (
          <div className="setup-nogroup stack-start">
            <p>Mach aus einem Wörtliblatt oder einer Heftseite Lernkarten – mit Fotos oder abgetippt.</p>
            <div className="stack-start__actions">
              <Link to="/stapel/neu" className="btn btn--primary btn--md" viewTransition>
                <Icon name="camera" size={20} />
                <span>Fotos aufnehmen</span>
              </Link>
              <Link to="/stapel/neu?text=1" className="btn btn--secondary btn--md" viewTransition>
                <Icon name="text" size={20} />
                <span>Abtippen</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="stack-picker" role="radiogroup" aria-label="Lernstapel wählen">
              {shown.map((stack) => (
                <button
                  key={stack.id}
                  type="button"
                  role="radio"
                  aria-checked={stack.id === value.stackId}
                  className={`stack-option ${stack.id === value.stackId ? 'is-active' : ''}`}
                  onClick={() => {
                    haptic(6);
                    onChange({ ...value, stackId: stack.id });
                  }}
                >
                  <span className="stack-option__emoji" aria-hidden="true">
                    {subjectEmoji(stack.subject)}
                  </span>
                  <span className="stack-option__body">
                    <span className="stack-option__title">{stack.title}</span>
                    <span className="stack-option__meta">
                      {stack.cards.length} {stack.cards.length === 1 ? 'Karte' : 'Karten'}
                      {stack.subject && ` · ${stack.subject}`}
                    </span>
                    {(dueByStack[stack.id] ?? 0) > 0 && <span className="due-pill">{dueByStack[stack.id]} fällig</span>}
                  </span>
                  <span className="stack-option__radio" aria-hidden="true">
                    {stack.id === value.stackId && <Icon name="check" size={16} strokeWidth={3} />}
                  </span>
                </button>
              ))}
            </div>
            <div className="stack-picker__actions">
              <Link to="/stapel/neu" className="btn btn--secondary btn--sm" viewTransition>
                <Icon name="plus" size={18} />
                <span>Neuer Stapel</span>
              </Link>
              {selected && (
                <Link to={`/stapel/${selected.id}`} className="btn btn--ghost btn--sm" viewTransition>
                  <Icon name="edit" size={18} />
                  <span>Karten ansehen</span>
                </Link>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title="Spielform">
        <div className="mode-picker" role="radiogroup" aria-label="Spielform">
          {MODES.map((mode) => {
            const reason = unavailable(mode.value, selected);
            const active = mode.value === value.mode;
            return (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={!!reason && !active}
                className={`mode-option ${active ? 'is-active' : ''} ${reason ? 'is-unavailable' : ''}`}
                onClick={() => {
                  if (reason && !active) {
                    haptic([10, 30, 10]);
                    return;
                  }
                  haptic(6);
                  onChange({ ...value, mode: mode.value });
                }}
              >
                <span className="mode-option__emoji" aria-hidden="true">
                  {mode.emoji}
                </span>
                <span className="mode-option__label">{mode.label}</span>
                <span className="mode-option__hint">{reason ?? mode.hint}</span>
                {!reason && suggested.has(mode.value) && (
                  <span className="mode-option__star" aria-hidden="true">
                    ★
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="settings-panel__hint stack-mode-hint">
          {MODES.find((m) => m.value === value.mode)?.text}
          {suggested.has(value.mode) && ' ★ Passt gut zu diesem Stapel.'}
        </p>
      </Section>
    </>
  );
}
