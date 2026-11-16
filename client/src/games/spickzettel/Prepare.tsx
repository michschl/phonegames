import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../../components/Icon.tsx';
import { Section } from '../../components/Layout.tsx';
import { haptic } from '../../lib/device.ts';
import { modeFits, recommendStacks, subjectEmoji, suggestedModes } from '../../lib/learn.ts';
import { normalize } from '../../lib/util.ts';
import { Sheet } from '../../components/ui.tsx';
import { LearnerPicker } from '../../components/LearnerPicker.tsx';
import { useData, useDueByStack, useStacks } from '../../store/data.ts';
import { useDefaultLearner, useLearners } from '../../store/learners.ts';
import { useSettings } from '../../store/settings.ts';
import { isSoloMode, MODES, SITUATIONS } from './modes.ts';
import type { GameSettingsProps } from '../types.ts';
import type { LearnMode, LearnStack } from '../../../../shared/types.ts';
import type { SpickzettelSettings } from './index.tsx';
import './spickzettel.css';

/** Stacks suggested on the setup screen – all others are one tap away under «Anderer Stapel». */
const SUGGESTED = 3;
/** From this many stacks the full list gets a search field. */
const SEARCH_FROM = 7;

function StackOption({ stack, active, due, onSelect }: { stack: LearnStack; active: boolean; due: number; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`stack-option ${active ? 'is-active' : ''}`}
      onClick={() => {
        haptic(6);
        onSelect();
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
        {due > 0 && <span className="due-pill">{due} fällig</span>}
      </span>
      <span className="stack-option__radio" aria-hidden="true">
        {active && <Icon name="check" size={16} strokeWidth={3} />}
      </span>
    </button>
  );
}

/** All stacks to choose from, alphabetical, with a search field for long lists. */
function StackChooser({
  open,
  onClose,
  stacks,
  selectedId,
  due,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  stacks: LearnStack[];
  selectedId: string | null;
  due: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...stacks].sort((a, b) => a.title.localeCompare(b.title, 'de-CH')), [stacks]);
  const q = normalize(query);
  const shown = q ? sorted.filter((stack) => normalize(`${stack.title} ${stack.subject}`).includes(q)) : sorted;
  return (
    <Sheet open={open} onClose={onClose} title="Lernstapel wählen">
      {stacks.length >= SEARCH_FROM && (
        <input
          className="stack-chooser__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Stapel oder Fach suchen"
          aria-label="Stapel oder Fach suchen"
          enterKeyHint="search"
        />
      )}
      <div className="stack-picker stack-chooser" role="radiogroup" aria-label="Alle Lernstapel">
        {shown.map((stack) => (
          <StackOption
            key={stack.id}
            stack={stack}
            active={stack.id === selectedId}
            due={due[stack.id] ?? 0}
            onSelect={() => {
              onSelect(stack.id);
              setQuery('');
              onClose();
            }}
          />
        ))}
        {shown.length === 0 && <p className="settings-panel__hint">Kein Stapel gefunden.</p>}
      </div>
    </Sheet>
  );
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
  const fitting = MODES.filter((mode) => !selected || modeFits(mode.value, selected));
  const learners = useLearners(value.stackId);
  const learner = useDefaultLearner(value.stackId, learners);
  const setLastLearner = useSettings((s) => s.setLastLearner);

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

  // Modes that do not fit the stack are not offered – fall back to the Kartenkasten.
  useEffect(() => {
    if (selected && !wanted && !modeFits(value.mode, selected)) onChange({ ...value, mode: 'kasten' });
  }, [selected, value.mode, wanted]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useData((s) => s.progress);
  const shown = useMemo(
    () => recommendStacks(stacks, progress, dueByStack, value.stackId, SUGGESTED),
    [stacks, progress, dueByStack, value.stackId],
  );
  const more = stacks.length > SUGGESTED;
  const [chooserOpen, setChooserOpen] = useState(false);

  return (
    <>
      <Section
        title="Lernstapel"
        action={
          stacks.length > 0 && (
            <Link to="/stapel" className="section__link" viewTransition>
              Verwalten
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
            {more && <p className="stack-picker__caption">Vorschläge – fällige und zuletzt gelernte Stapel</p>}
            <div className="stack-picker" role="radiogroup" aria-label="Lernstapel wählen">
              {shown.map((stack) => (
                <StackOption
                  key={stack.id}
                  stack={stack}
                  active={stack.id === value.stackId}
                  due={dueByStack[stack.id] ?? 0}
                  onSelect={() => onChange({ ...value, stackId: stack.id })}
                />
              ))}
            </div>
            <div className="stack-picker__actions">
              {more && (
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setChooserOpen(true)}>
                  <Icon name="cards" size={18} />
                  <span>Anderer Stapel ({stacks.length})</span>
                </button>
              )}
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
            <StackChooser
              open={chooserOpen}
              onClose={() => setChooserOpen(false)}
              stacks={stacks}
              selectedId={value.stackId}
              due={dueByStack}
              onSelect={(stackId) => onChange({ ...value, stackId })}
            />
          </>
        )}
      </Section>

      <Section title="Spielform">
        {SITUATIONS.map((situation) => {
          const modes = fitting.filter((mode) => mode.situation === situation.value);
          if (modes.length === 0) return null;
          return (
            <div key={situation.value} className="mode-group">
              <p className="mode-group__title" id={`mode-group-${situation.value}`}>
                {situation.label}
              </p>
              <div className="mode-picker" role="radiogroup" aria-labelledby={`mode-group-${situation.value}`}>
                {modes.map((mode) => {
                  const active = mode.value === value.mode;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`mode-option ${active ? 'is-active' : ''}`}
                      onClick={() => {
                        haptic(6);
                        onChange({ ...value, mode: mode.value });
                      }}
                    >
                      <span className="mode-option__emoji" aria-hidden="true">
                        {mode.emoji}
                      </span>
                      <span className="mode-option__label">{mode.label}</span>
                      <span className="mode-option__hint">{mode.hint}</span>
                      {suggested.has(mode.value) && (
                        <span className="mode-option__star" aria-hidden="true">
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <p className="settings-panel__hint stack-mode-hint">
          {MODES.find((m) => m.value === value.mode)?.text}
          {suggested.has(value.mode) && ' ★ Passt gut zu diesem Stapel.'}
        </p>
      </Section>

      {selected && isSoloMode(value.mode) && (
        <Section title="Wer lernt?">
          <LearnerPicker
            stackId={selected.id}
            learners={learners}
            selected={learner}
            onSelect={(name) => setLastLearner(selected.id, name)}
          />
        </Section>
      )}
    </>
  );
}
