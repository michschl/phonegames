import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { DocTask, LearnTopic, TaskDocument } from '../../../shared/types.ts';
import { Mascot } from '../components/Brand.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomBar, Page, Section } from '../components/Layout.tsx';
import { Notepad, type NoteStroke } from '../components/Notepad.tsx';
import { Avatar, Button, ConfirmSheet } from '../components/ui.tsx';
import { CoinGain } from '../components/Coins.tsx';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { grade, KIND_INFO, totalPoints, TYPE_LABEL, usesGrid } from '../lib/taskDocs.ts';
import { attemptPoints, attemptSummary, autoScore, formatGrade, formatPoints, goalStatus, GOAL_LEVEL } from '../lib/taskResults.ts';
import { createId } from '../lib/util.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useRewards, useTopic } from '../store/data.ts';
import { saveAttempt, useDocuments } from '../store/documents.ts';
import { useLearners } from '../store/learners.ts';
import { useGameSettings } from '../store/settings.ts';
import { useSolve } from '../store/solve.ts';
import { toast } from '../store/ui.ts';

/*
 * «Aufgaben», stage 3: solve a document in the app – one task at a time, with a «Notizblatt» for
 * working out – or enter the points of a sheet solved on paper. The results show how well each learning
 * goal sits.
 */

/** «Wer löst?» – the names of «Wer lernt?»; remembered per device. */
function useSolver(): [string, (name: string) => void, { id: string; name: string; color: string }[]] {
  const learners = useLearners();
  const self = useAuth((s) => s.user?.name ?? '');
  const [chosen, setChosen] = useGameSettings<{ learner: string }>('aufgaben-loesen', { learner: '' });
  const known = learners.find((l) => l.name.toLowerCase() === chosen.learner.toLowerCase());
  return [known?.name ?? learners[0]?.name ?? self, (learner) => setChosen({ learner }), learners];
}

function SolverPicker({ value, onChange, learners }: { value: string; onChange: (name: string) => void; learners: { id: string; name: string; color: string }[] }) {
  if (learners.length < 2) return null;
  return (
    <div className="solver-picker" role="radiogroup" aria-label="Wer löst?">
      {learners.map((learner) => (
        <button
          key={learner.id}
          type="button"
          role="radio"
          aria-checked={learner.name === value}
          className={`solver-chip ${learner.name === value ? 'is-active' : ''}`}
          onClick={() => {
            haptic(5);
            onChange(learner.name);
          }}
        >
          <Avatar name={learner.name} color={learner.color} size={30} />
          <span>{learner.name}</span>
        </button>
      ))}
    </div>
  );
}

function useDocAndTopic(): { doc: TaskDocument | undefined; topic: LearnTopic | undefined } {
  const { topicId, docId } = useParams();
  const topic = useTopic(topicId);
  const doc = useDocuments((s) => (docId ? s.docs[docId] : undefined));
  return { doc, topic };
}

/* ---------------------------------------------------------------- solving */

function TaskAnswer({
  task,
  value,
  onChange,
  disabled = false,
}: {
  task: DocTask;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  if (task.type === 'choice' || task.type === 'truefalse') {
    const options = task.type === 'choice' ? task.options : ['richtig', 'falsch'];
    return (
      <div className={`solve-options ${task.type === 'truefalse' ? 'is-pair' : ''}`} role="radiogroup" aria-label="Antworten">
        {options.map((option, i) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            disabled={disabled}
            className={`solve-option ${value === option ? 'is-chosen' : ''}`}
            onClick={() => {
              sound.tap();
              haptic(6);
              onChange(option);
            }}
          >
            {task.type === 'choice' && (
              <span className="solve-option__key" aria-hidden="true">
                {String.fromCharCode(65 + i)}
              </span>
            )}
            <span>{option}</span>
          </button>
        ))}
      </div>
    );
  }
  if (task.type === 'short') {
    return (
      <input
        className="text-import solve-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Deine Antwort"
        aria-label="Deine Antwort"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="next"
        disabled={disabled}
      />
    );
  }
  return (
    <textarea
      className="text-import solve-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Deine Antwort – oder rechne auf dem Notizblatt"
      aria-label="Deine Antwort"
      rows={Math.min(8, Math.max(3, task.lines))}
      disabled={disabled}
    />
  );
}

/** Points of an open task, given by the person with the sample solution. */
function PointsPicker({ max, value, onChange, label }: { max: number; value: number | undefined; onChange: (value: number) => void; label: string }) {
  const steps = Array.from({ length: Math.floor(max) + 1 }, (_, i) => i);
  if (!Number.isInteger(max)) steps.push(max);
  return (
    <div className="points-picker" role="radiogroup" aria-label={label}>
      {steps.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className={`points-picker__step ${value === n ? 'is-active' : ''}`}
          onClick={() => {
            haptic(5);
            onChange(n);
          }}
        >
          {formatPoints(n)}
        </button>
      ))}
    </div>
  );
}

/** /aufgaben/:topicId/:docId/loesen */
export function SolvePage() {
  const { doc, topic } = useDocAndTopic();
  const rewards = useRewards();
  const ownerId = useAuth((s) => s.user?.id ?? '');
  const stored = useSolve((s) => (doc ? s.sessions[doc.id] : undefined));
  const session = stored && stored.ownerId === ownerId ? stored : undefined;
  const { start, update, end } = useSolve.getState();
  const [solver, setSolver, learners] = useSolver();
  // Notes per task – in memory only (they are working space, not a result).
  const notes = useRef<Record<string, NoteStroke[]>>({});
  const [, setNotesVersion] = useState(0);
  const [padOpen, setPadOpen] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ points: number; summary: string; queued: boolean; learner: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  if (!topic || !doc) return <Navigate to={topic ? `/aufgaben/${topic.id}` : '/lernen/aufgaben'} replace />;
  if (doc.status !== 'ready') return <Navigate to={`/aufgaben/${topic.id}/${doc.id}`} replace />;
  const back = `/aufgaben/${topic.id}/${doc.id}`;
  const grid = usesGrid(topic);
  const max = totalPoints(doc);

  if (result) {
    const status = goalStatus(topic, [doc]);
    const goals = topic.goals.filter((g) => status[g.id]?.level !== 'offen');
    const share = max > 0 ? result.points / max : 0;
    return (
      <Page title="Geschafft!" subtitle={doc.title} back={back} className="solve-done">
        <div className="solve-result">
          <Mascot size={130} mood={share >= 0.8 ? 'party' : share >= 0.5 ? 'happy' : 'wink'} />
          <p className="solve-result__points">{result.summary}</p>
          <p className="solve-result__text">
            {share >= 0.8 ? 'Stark – das sitzt!' : share >= 0.5 ? 'Gut gemacht! Ein paar Dinge noch üben.' : 'Dranbleiben – beim nächsten Mal geht’s besser.'}
          </p>
          <CoinGain learner={result.learner} amount={Math.round(result.points) * rewards.perPoint} reason={`${KIND_INFO[doc.kind].label} «${topic.title}»`} />
          {result.queued && <p className="notice notice--info">Ohne Internet gespeichert – wird später übertragen.</p>}
        </div>
        {goals.length > 0 && (
          <Section title="Lernziele">
            <ul className="goal-status-list">
              {goals.map((goal) => {
                const s = status[goal.id]!;
                const level = s.level === 'offen' ? null : GOAL_LEVEL[s.level];
                return (
                  <li key={goal.id} className={`goal-status is-${s.level}`}>
                    <span className="goal-status__badge">
                      {level?.emoji} {level?.label}
                    </span>
                    <span>{goal.text}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <BottomBar>
          <Link to={`/aufgaben/${topic.id}`} className="btn btn--primary btn--lg btn--block" viewTransition>
            Zum Thema
          </Link>
        </BottomBar>
      </Page>
    );
  }

  if (!session) {
    return (
      <Page title="In der App lösen" subtitle={doc.title} back={back} className="solve-start">
        <div className="solve-intro">
          <span className="solve-intro__emoji" aria-hidden="true">
            {KIND_INFO[doc.kind].emoji}
          </span>
          <p className="solve-intro__meta">
            {doc.tasks.length} Aufgaben · {formatPoints(max)} Punkte · etwa {doc.durationMin} Minuten
          </p>
          {doc.intro && <p className="doc-intro">{doc.intro}</p>}
          <p className="solve-intro__hint">
            Antworten wählst oder tippst du ein. Für längere Aufgaben gibt es ein Notizblatt{grid ? ' mit Häuschen' : ''} – mit dem Finger oder einem
            Stift. Am Schluss siehst du die Lösungen und gibst dir die Punkte für die ausführlichen Aufgaben selbst.
          </p>
        </div>
        {learners.length > 1 && (
          <Section title="Wer löst?">
            <SolverPicker value={solver} onChange={setSolver} learners={learners} />
          </Section>
        )}
        <BottomBar>
          <Button
            size="lg"
            block
            icon="play"
            onClick={() => {
              sound.unlock();
              sound.tap();
              start(doc.id, ownerId, solver);
            }}
          >
            Los geht’s
          </Button>
        </BottomBar>
      </Page>
    );
  }

  const tasks = doc.tasks;
  const answerOf = (task: DocTask) => session.answers[task.id] ?? '';
  const setAnswer = (task: DocTask, value: string) => update(doc.id, { answers: { ...session.answers, [task.id]: value } });

  if (session.submitted) {
    const open = tasks.filter((t) => t.type === 'open');
    const unrated = open.filter((t) => session.own[t.id] === undefined).length;
    const scores: Record<string, number> = {};
    for (const task of tasks) {
      const score = autoScore(task, answerOf(task)) ?? session.own[task.id];
      if (score !== undefined) scores[task.id] = score;
    }
    const save = async () => {
      setSaving(true);
      const attempt = { id: createId(), at: Date.now(), mode: 'app' as const, learner: session.learner, scores };
      try {
        const how = await saveAttempt(doc.id, attempt);
        end(doc.id);
        sound.fanfare();
        haptic([20, 40, 20]);
        setResult({ points: attemptPoints(attempt), summary: attemptSummary(doc, attempt), queued: how === 'queued', learner: session.learner });
      } catch {
        toast('Das Ergebnis konnte nicht gespeichert werden.', { tone: 'error' });
        setSaving(false);
      }
    };
    return (
      <Page title="Lösungen" subtitle={doc.title} back={back} className="solve-review">
        <p className="notice notice--info">
          {unrated > 0
            ? `Vergleiche deine Antworten mit der Musterlösung und gib dir bei ${unrated === 1 ? 'einer Aufgabe' : `${unrated} Aufgaben`} die Punkte selbst.`
            : 'Alles bewertet – speichere dein Ergebnis.'}
        </p>
        <ol className="doc-tasks">
          {tasks.map((task, i) => {
            const auto = autoScore(task, answerOf(task));
            const given = answerOf(task).trim();
            return (
              <li key={task.id} className={`doc-task solve-check ${auto === null ? '' : auto > 0 ? 'is-right' : 'is-wrong'}`}>
                <div className="doc-task__head">
                  <span className="doc-task__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="doc-task__type">{TYPE_LABEL[task.type]}</span>
                  <span className="doc-task__points">
                    {auto === null
                      ? `${session.own[task.id] === undefined ? '?' : formatPoints(session.own[task.id]!)} / ${formatPoints(task.points)}`
                      : `${formatPoints(auto)} / ${formatPoints(task.points)}`}
                  </span>
                </div>
                <p className="doc-task__prompt">{task.prompt}</p>
                <p className="solve-check__mine">
                  <strong>Deine Antwort:</strong> {given || '–'}
                  {auto !== null && <span className="solve-check__mark">{auto > 0 ? ' ✓' : ' ✗'}</span>}
                </p>
                {(notes.current[task.id]?.length ?? 0) > 0 && <Notepad strokes={notes.current[task.id]!} grid={grid} readOnly label={`Notizen zu Aufgabe ${i + 1}`} />}
                <div className="doc-task__solution">
                  <p>
                    <strong>Lösung:</strong> {task.answer}
                  </p>
                  {task.solution && task.solution !== task.answer && <p className="doc-task__explain">{task.solution}</p>}
                </div>
                {auto === null && (
                  <>
                    <p className="solve-check__ask">Wie viele Punkte gibst du dir?</p>
                    <PointsPicker
                      max={task.points}
                      value={session.own[task.id]}
                      label={`Punkte für Aufgabe ${i + 1}`}
                      onChange={(value) => update(doc.id, { own: { ...session.own, [task.id]: value } })}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <BottomBar>
          <Button size="lg" block icon="check" loading={saving} disabled={unrated > 0} onClick={() => void save()}>
            Ergebnis speichern
          </Button>
        </BottomBar>
      </Page>
    );
  }

  const index = Math.min(session.index, tasks.length - 1);
  const task = tasks[index]!;
  const last = index === tasks.length - 1;
  const answered = tasks.filter((t) => answerOf(t).trim() || (notes.current[t.id]?.length ?? 0) > 0).length;
  const go = (next: number) => {
    haptic(6);
    update(doc.id, { index: next });
    window.scrollTo({ top: 0 });
  };
  const showPad = padOpen[task.id] ?? (task.type === 'open' && grid);
  const submit = () => {
    sound.sparkle();
    update(doc.id, { submitted: true });
    window.scrollTo({ top: 0 });
  };

  return (
    <Page title={`Aufgabe ${index + 1} von ${tasks.length}`} subtitle={doc.title} back={back} className="solve-page">
      <div className="solve-progress" role="progressbar" aria-label="Fortschritt" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={index + 1}>
        <span style={{ width: `${((index + 1) / tasks.length) * 100}%` }} />
      </div>
      <article className="solve-task" aria-labelledby="solve-prompt">
        <div className="doc-task__head">
          <span className="doc-task__type">{TYPE_LABEL[task.type]}</span>
          <span className="doc-task__points">
            {formatPoints(task.points)} {task.points === 1 ? 'Punkt' : 'Punkte'}
          </span>
        </div>
        <p id="solve-prompt" className="solve-task__prompt">
          {task.prompt}
        </p>
        <TaskAnswer task={task} value={answerOf(task)} onChange={(value) => setAnswer(task, value)} />
        {(task.type === 'open' || (task.type === 'short' && grid)) && (
          <div className="solve-pad">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              aria-expanded={showPad}
              onClick={() => setPadOpen((p) => ({ ...p, [task.id]: !showPad }))}
            >
              <Icon name="pencil" size={18} />
              <span>{showPad ? 'Notizblatt zuklappen' : 'Notizblatt'}</span>
            </button>
            {showPad && (
              <Notepad
                strokes={notes.current[task.id] ?? []}
                grid={grid}
                onChange={(strokes) => {
                  notes.current = { ...notes.current, [task.id]: strokes };
                  setNotesVersion((v) => v + 1);
                }}
              />
            )}
          </div>
        )}
      </article>
      <nav className="solve-dots" aria-label="Aufgaben">
        {tasks.map((t, i) => (
          <button
            key={t.id}
            type="button"
            className={`solve-dot ${i === index ? 'is-current' : ''} ${answerOf(t).trim() || (notes.current[t.id]?.length ?? 0) > 0 ? 'is-done' : ''}`}
            aria-label={`Aufgabe ${i + 1}${answerOf(t).trim() ? ', beantwortet' : ''}`}
            aria-current={i === index ? 'step' : undefined}
            onClick={() => go(i)}
          >
            {i + 1}
          </button>
        ))}
      </nav>
      <BottomBar>
        <div className="solve-nav">
          <Button variant="secondary" icon="back" disabled={index === 0} onClick={() => go(index - 1)}>
            Zurück
          </Button>
          {last ? (
            <Button
              icon="check"
              onClick={() => (answered < tasks.length ? setConfirmSubmit(true) : submit())}
            >
              Abgeben
            </Button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--md"
              onClick={() => {
                haptic(8);
                go(index + 1);
              }}
            >
              <span>Weiter</span>
              <Icon name="next" size={20} />
            </button>
          )}
        </div>
      </BottomBar>
      <p className="solve-keep">Deine Antworten bleiben gespeichert, wenn du die Seite verlässt.</p>
      <ConfirmSheet
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Trotzdem abgeben?"
        message={`Bei ${tasks.length - answered === 1 ? 'einer Aufgabe fehlt' : `${tasks.length - answered} Aufgaben fehlt`} noch die Antwort.`}
        confirmLabel="Abgeben"
        onConfirm={() => {
          setConfirmSubmit(false);
          submit();
        }}
      />
    </Page>
  );
}

/* ----------------------------------------------------- results from paper */

/** /aufgaben/:topicId/:docId/ergebnis – the points of a sheet solved on paper, task by task. */
export function PaperResultPage() {
  const { doc, topic } = useDocAndTopic();
  const navigate = useNavigate();
  const [solver, setSolver, learners] = useSolver();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const max = doc ? totalPoints(doc) : 0;
  const points = useMemo(() => Object.values(scores).reduce((a, b) => a + b, 0), [scores]);

  if (!topic || !doc) return <Navigate to={topic ? `/aufgaben/${topic.id}` : '/lernen/aufgaben'} replace />;
  if (doc.status !== 'ready') return <Navigate to={`/aufgaben/${topic.id}/${doc.id}`} replace />;
  const back = `/aufgaben/${topic.id}/${doc.id}`;
  const missing = doc.tasks.filter((t) => scores[t.id] === undefined).length;

  const save = async () => {
    setSaving(true);
    const attempt = { id: createId(), at: Date.now(), mode: 'paper' as const, learner: solver, scores };
    try {
      const how = await saveAttempt(doc.id, attempt);
      sound.fanfare();
      const earned = solver ? useData.getState().earnCoins(solver, Math.round(points) * (useData.getState().rewards?.perPoint ?? 0), `${KIND_INFO[doc.kind].label} «${topic.title}»`) : 0;
      toast(
        `${attemptSummary(doc, attempt)}${earned > 0 ? ` · +${earned} 🪙 für ${solver}` : ''}${how === 'queued' ? ' – wird übertragen, sobald du online bist' : ''}`,
        { tone: 'success' },
      );
      navigate(`/aufgaben/${topic.id}`, { replace: true, viewTransition: true });
    } catch {
      toast('Das Ergebnis konnte nicht gespeichert werden.', { tone: 'error' });
      setSaving(false);
    }
  };

  return (
    <Page title="Ergebnis eintragen" subtitle={doc.title} back={back} className="paper-result">
      <p className="notice notice--info">Auf Papier gelöst? Korrigiere mit der Musterlösung und trag pro Aufgabe die Punkte ein.</p>
      {learners.length > 1 && (
        <Section title="Wer hat gelöst?">
          <SolverPicker value={solver} onChange={setSolver} learners={learners} />
        </Section>
      )}
      <Section
        title="Punkte"
        action={
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setScores(Object.fromEntries(doc.tasks.map((t) => [t.id, t.points])))}
          >
            Alles richtig
          </button>
        }
      >
        <ol className="paper-tasks">
          {doc.tasks.map((task, i) => (
            <li key={task.id} className="paper-task">
              <p className="paper-task__prompt">
                <strong>{i + 1}.</strong> {task.prompt}
              </p>
              <p className="paper-task__answer">Lösung: {task.answer}</p>
              <PointsPicker
                max={task.points}
                value={scores[task.id]}
                label={`Punkte für Aufgabe ${i + 1}`}
                onChange={(value) => setScores((s) => ({ ...s, [task.id]: value }))}
              />
            </li>
          ))}
        </ol>
      </Section>
      <BottomBar>
        <p className="paper-total" aria-live="polite">
          {formatPoints(points)} von {formatPoints(max)} Punkten
          {doc.kind === 'exam' && missing === 0 && ` · Note ${formatGrade(grade(points, max))}`}
          {missing > 0 && ` · noch ${missing} offen`}
        </p>
        <Button size="lg" block icon="check" loading={saving} disabled={missing > 0} onClick={() => void save()}>
          Ergebnis speichern
        </Button>
      </BottomBar>
    </Page>
  );
}
