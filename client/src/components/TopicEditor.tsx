import { useId, useRef, useState } from 'react';
import { LIMITS, TOPIC_LEVELS } from '../../../shared/types.ts';
import { haptic } from '../lib/device.ts';
import { withUndo } from '../store/undo.ts';
import { emptyGoal, type EditorGoal, type TopicEditorValue } from '../store/topicDraft.ts';
import { Section } from './Layout.tsx';
import { AutoTextarea } from './StackEditor.tsx';
import { Button, IconButton, TextField } from './ui.tsx';

/** «Stufe»: the school level – the AI writes tests and tasks for it. */
export function LevelField({ value, onChange }: { value: string; onChange: (level: string) => void }) {
  const id = useId();
  const known = (TOPIC_LEVELS as readonly string[]).includes(value);
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        Stufe
      </label>
      <div className="field__control">
        <select id={id} className="field__select" value={value} onChange={(e) => onChange(e.target.value)}>
          {!known && <option value={value}>{value || 'Bitte wählen'}</option>}
          {TOPIC_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Edits a topic of «Aufgaben»: title, subject, level, the day of the test and the learning goals
 * with their core content – after the AI suggested them, and later at any time.
 */
export function TopicEditor({
  value,
  onChange,
  invalid = false,
}: {
  value: TopicEditorValue;
  onChange: (next: TopicEditorValue) => void;
  /** No learning goal yet – shown as an error. */
  invalid?: boolean;
}) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // The undo of a deleted goal goes into the value as it is then, not as it was.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const update = (key: string, patch: Partial<EditorGoal>) =>
    onChange({ ...value, goals: value.goals.map((goal) => (goal.key === key ? { ...goal, ...patch } : goal)) });
  const remove = (key: string) => {
    const index = value.goals.findIndex((goal) => goal.key === key);
    const removed = value.goals[index];
    haptic(10);
    onChange({ ...value, goals: value.goals.filter((goal) => goal.key !== key) });
    if (!removed || (!removed.text.trim() && !removed.content.trim())) return;
    withUndo(
      `Lernziel ${index + 1} gelöscht.`,
      () => {
        const current = latest.current;
        if (current.value.goals.some((goal) => goal.key === removed.key)) return;
        const goals = [...current.value.goals];
        goals.splice(Math.min(index, goals.length), 0, removed);
        current.onChange({ ...current.value, goals });
      },
      'Lernziel ist wieder da.',
    );
  };
  const add = () => {
    haptic(8);
    const goal = emptyGoal();
    setFocusKey(goal.key);
    onChange({ ...value, goals: [...value.goals, goal] });
  };
  const unsure = value.goals.filter((goal) => goal.uncertain).length;

  return (
    <>
      <Section title="Thema">
        <div className="form stack-meta">
          <TextField
            label="Titel"
            icon="text"
            value={value.title}
            maxLength={LIMITS.stackTitleMax}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder="z. B. Die Römer"
          />
          <TextField
            label="Fach"
            icon="cards"
            value={value.subject}
            maxLength={40}
            onChange={(e) => onChange({ ...value, subject: e.target.value })}
            placeholder="z. B. Geschichte"
          />
          <LevelField value={value.level} onChange={(level) => onChange({ ...value, level })} />
          <TextField
            label="Prüfung am (freiwillig)"
            icon="clock"
            type="date"
            value={value.examDate ?? ''}
            onChange={(e) => onChange({ ...value, examDate: e.target.value || null })}
          />
        </div>
      </Section>

      <Section
        title={`Lernziele (${value.goals.length})`}
        action={unsure > 0 ? <span className="card-list__unsure">{unsure} prüfen</span> : undefined}
      >
        <ol className="card-list goal-list">
          {value.goals.map((goal, index) => (
            <li key={goal.key} className={`card-row ${goal.uncertain ? 'is-uncertain' : ''}`}>
              <span className="card-row__num" aria-hidden="true">
                {index + 1}
              </span>
              <div className="card-row__fields">
                <AutoTextarea
                  className="card-row__input card-row__prompt"
                  aria-label={`Lernziel ${index + 1}`}
                  placeholder="Du kannst …"
                  value={goal.text}
                  maxLength={LIMITS.goalText}
                  autoFocus={focusKey === goal.key}
                  onChange={(e) => update(goal.key, { text: e.target.value, uncertain: '' })}
                />
                <AutoTextarea
                  className="card-row__input goal-row__content"
                  aria-label={`Lernziel ${index + 1}: Kernstoff`}
                  placeholder="Kernstoff: Fakten, Begriffe, Regeln, Beispiele"
                  value={goal.content}
                  maxLength={LIMITS.goalContent}
                  onChange={(e) => update(goal.key, { content: e.target.value, uncertain: '' })}
                />
                {goal.uncertain && (
                  <p className="card-row__warn">
                    <span>Bitte prüfen: {goal.uncertain}</span>
                    <button type="button" onClick={() => update(goal.key, { uncertain: '' })}>
                      Passt so
                    </button>
                  </p>
                )}
              </div>
              <IconButton icon="trash" label={`Lernziel ${index + 1} löschen`} className="icon-btn--small" onClick={() => remove(goal.key)} />
            </li>
          ))}
        </ol>
        {invalid && <p className="field__error">Das Thema braucht mindestens ein Lernziel.</p>}
        {value.goals.length < LIMITS.goalsPerTopic && (
          <Button variant="secondary" block icon="plus" onClick={add}>
            Lernziel hinzufügen
          </Button>
        )}
      </Section>
    </>
  );
}
