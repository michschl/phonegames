import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import type { LearnTopic, LearnUsage } from '../../../shared/types.ts';
import { Mascot } from '../components/Brand.tsx';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomBar, Page, Section } from '../components/Layout.tsx';
import { PhotoGrid, type Photo } from '../components/PhotoGrid.tsx';
import { LevelField, TopicEditor } from '../components/TopicEditor.tsx';
import { ActionSheet, Button, ConfirmSheet, EmptyState, IconButton, Segmented, TextField } from '../components/ui.tsx';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { subjectEmoji } from '../lib/learn.ts';
import { daysUntil, examDateLabel, examLabel } from '../lib/topics.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useTopic, useTopics } from '../store/data.ts';
import { useSettings } from '../store/settings.ts';
import { emptyGoal, fromTopic, fromTopicDraft, toTopicInput, useTopicDraft, type TopicEditorValue } from '../store/topicDraft.ts';
import { toast, useUi } from '../store/ui.ts';
import { deleteTopicWithUndo, withUndo } from '../store/undo.ts';

/** The topics of «Aufgaben» – the second area of the «Lernen» tab. */
export const TASKS = '/lernen/aufgaben';

/* ---------------------------------------------------------- the two areas */

/** «Karten | Aufgaben» at the top of the «Lernen» tab; the tab opens the area used last. */
export function LearnAreaSwitch({ area }: { area: 'karten' | 'aufgaben' }) {
  const navigate = useNavigate();
  const setLearnArea = useSettings((s) => s.setLearnArea);
  useEffect(() => setLearnArea(area), [area, setLearnArea]);
  return (
    <div className="learn-area">
      <Segmented
        label="Bereich"
        value={area}
        options={[
          { value: 'karten', label: 'Karten' },
          { value: 'aufgaben', label: 'Aufgaben' },
        ]}
        onChange={(value) => {
          haptic(6);
          navigate(value === 'aufgaben' ? TASKS : '/lernen', { replace: true, viewTransition: true });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- hub */

const HOW_TO = [
  '«Neues Thema»: Lernziele, Buchseiten oder Arbeitsblätter fotografieren – oder ein paar Stichworte schreiben. Dazu die Stufe, damit es zum Alter passt.',
  'Phoni formuliert die Lernziele mit dem Kernstoff nach Lehrplan 21. Du prüfst und ergänzt sie – sie sind die Grundlage für alles Weitere.',
  'Unterlagen erstellen: Wissenstest, Übungsaufgaben oder Probeprüfung – zum Ausdrucken als PDF, mit Musterlösung auf eigenen Seiten.',
  'In der App lösen oder auf Papier. Das Ergebnis zeigt, welche Lernziele noch nicht sitzen – die nächsten Unterlagen üben genau diese.',
];

/** Topics with a test coming up first (soonest first), then the ones edited last. */
function sortTopics(topics: LearnTopic[], now = Date.now()): LearnTopic[] {
  const upcoming = (topic: LearnTopic) => {
    const days = daysUntil(topic.examDate, now);
    return days !== null && days >= 0 ? days : Infinity;
  };
  return [...topics].sort((a, b) => upcoming(a) - upcoming(b) || b.updatedAt - a.updatedAt);
}

function goalCount(n: number): string {
  return `${n} ${n === 1 ? 'Lernziel' : 'Lernziele'}`;
}

/** First visit: what «Aufgaben» does – and the way to the first topic. */
function TasksIntro() {
  return (
    <div className="learn-intro">
      <Mascot size={110} mood="happy" />
      <h2 className="learn-intro__title">Prüfungen vorbereiten</h2>
      <ol className="learn-intro__steps">
        <li>
          <strong>Lernziele fotografieren</strong> – oder Stichworte schreiben.
        </li>
        <li>
          <strong>Kurz prüfen</strong> – Phoni formuliert die Lernziele mit dem Stoff.
        </li>
        <li>
          <strong>Unterlagen erstellen</strong> – Tests, Aufgaben und Probeprüfungen mit Lösungen.
        </li>
      </ol>
      <div className="learn-intro__actions">
        <Link to="/aufgaben/neu" className="btn btn--primary btn--lg btn--block" viewTransition>
          <Icon name="camera" size={20} />
          <span>Lernziele fotografieren</span>
        </Link>
        <Link to="/aufgaben/neu?stichworte=1" className="btn btn--secondary btn--lg btn--block" viewTransition>
          <Icon name="text" size={20} />
          <span>Stichworte schreiben</span>
        </Link>
      </div>
    </div>
  );
}

/** /lernen/aufgaben: the topics for tests – larger subjects than single cards. */
export function TasksHubPage() {
  const topics = useTopics();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<LearnTopic | null>(null);
  const sorted = useMemo(() => sortTopics(topics), [topics]);

  return (
    <Page title="Lernen" subtitle={topics.length > 0 ? 'Prüfungen vorbereiten – mit Tests, Aufgaben und Probeprüfungen.' : undefined}>
      <LearnAreaSwitch area="aufgaben" />
      {topics.length === 0 ? (
        <TasksIntro />
      ) : (
        <>
          <Section title="Themen">
            <div className="group-list">
              {sorted.map((topic, i) => {
                const exam = examLabel(topic.examDate);
                return (
                  <div key={topic.id} className="list-row" style={{ animationDelay: `${i * 60}ms` }}>
                    <Link to={`/aufgaben/${topic.id}`} className="group-card" viewTransition>
                      <span className="group-card__emoji" aria-hidden="true">
                        {subjectEmoji(topic.subject)}
                      </span>
                      <span className="group-card__body">
                        <span className="group-card__name">{topic.title}</span>
                        <span className="group-card__count">
                          {[goalCount(topic.goals.length), topic.subject, topic.level].filter(Boolean).join(' · ')}
                        </span>
                        {exam && <span className="exam-pill">{exam}</span>}
                      </span>
                    </Link>
                    <IconButton icon="more" label={`Aktionen für «${topic.title}»`} className="list-row__more" onClick={() => setMenu(topic)} />
                  </div>
                );
              })}
              <Link to="/aufgaben/neu" className="stack-add" viewTransition>
                <span className="stack-add__icon" aria-hidden="true">
                  <Icon name="plus" size={26} strokeWidth={2.8} />
                </span>
                <span className="stack-add__body">
                  <strong>Neues Thema</strong>
                  <small>Lernziele fotografieren oder Stichworte schreiben</small>
                </span>
              </Link>
            </div>
          </Section>
          <Section title="So geht’s">
            <Fold title="In vier Schritten" icon="sparkles">
              <ol className="rules">
                {HOW_TO.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Fold>
          </Section>
        </>
      )}
      <ActionSheet
        open={menu !== null}
        onClose={() => setMenu(null)}
        title={menu?.title ?? ''}
        actions={
          menu
            ? [
                { label: 'Öffnen', icon: 'next', onClick: () => navigate(`/aufgaben/${menu.id}`, { viewTransition: true }) },
                { label: 'Bearbeiten', icon: 'edit', onClick: () => navigate(`/aufgaben/${menu.id}/bearbeiten`, { viewTransition: true }) },
                { label: 'Thema löschen', icon: 'trash', danger: true, onClick: () => deleteTopicWithUndo(menu) },
              ]
            : []
        }
      />
    </Page>
  );
}

/* ------------------------------------------------------------- new topic */

type Step = 'input' | 'reading' | 'review';

function emptyValue(level: string): TopicEditorValue {
  return { title: '', subject: '', level, goals: [emptyGoal()], notes: '', examDate: null, source: 'text' };
}

/**
 * /aufgaben/neu: photos of learning goals, book pages or worksheets – and/or keywords. The AI writes
 * the learning goals with their content; they are checked before saving.
 */
export function NewTopicPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const userId = useAuth((s) => s.user?.id ?? '');
  const online = useUi((s) => s.online);
  const saveTopic = useData((s) => s.saveTopic);
  const storedDraft = useTopicDraft((s) => s.draft);
  const setDraft = useTopicDraft((s) => s.setDraft);
  const draft = storedDraft && storedDraft.ownerId === userId ? storedDraft : null;
  const rememberedLevel = useSettings((s) => s.topicLevel);
  const setTopicLevel = useSettings((s) => s.setTopicLevel);

  const [step, setStep] = useState<Step>(() => (draft ? 'review' : 'input'));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [notes, setNotes] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState(rememberedLevel ?? '5. Klasse');
  const [usage, setUsage] = useState<LearnUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!online) return;
    api
      .learnUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [online]);

  const updateDraft = (value: TopicEditorValue) => setDraft({ ...value, ownerId: userId });

  const analyse = async () => {
    if (photos.length === 0 && notes.trim().length < 3) return;
    setError(null);
    setTopicLevel(level);
    setStep('reading');
    sound.unlock();
    try {
      const result = await api.topicDraft({ images: photos.map((p) => p.url), text: notes, subject: subject.trim(), level });
      setUsage(result.usage);
      updateDraft(fromTopicDraft(result.draft, { notes, examDate: null, source: photos.length > 0 ? 'photo' : 'text' }));
      setPhotos([]);
      sound.sparkle();
      haptic([20, 40, 20]);
      setStep('review');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'learn_limit') setUsage((u) => (u ? { ...u, remaining: 0 } : u));
      setError(errorMessage(err));
      sound.fail();
      setStep('input');
    }
  };

  const writeOwn = () => {
    setTopicLevel(level);
    updateDraft({ ...emptyValue(level), subject: subject.trim(), notes });
    setStep('review');
  };

  const save = () => {
    if (!draft) return;
    const input = toTopicInput(draft);
    if (input.goals.length === 0) {
      setInvalid(true);
      haptic([30, 40, 30]);
      return;
    }
    const topic = saveTopic(input);
    setDraft(null);
    sound.fanfare();
    toast(`«${topic.title}» ist gespeichert 🎉`, { tone: 'success' });
    navigate(`/aufgaben/${topic.id}`, { replace: true, viewTransition: true });
  };

  if (step === 'reading') {
    return (
      <Page title="Neues Thema" className="stack-new">
        <div className="reading" role="status" aria-live="polite">
          <Mascot size={150} mood="wow" />
          <p className="reading__title">{photos.length > 0 ? 'Phoni liest deine Fotos …' : 'Phoni denkt nach …'}</p>
          <p className="reading__text">Die Lernziele entstehen – das dauert etwa 20 Sekunden.</p>
          <span className="reading__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      </Page>
    );
  }

  if (step === 'review' && draft) {
    const unsure = draft.goals.filter((g) => g.uncertain).length;
    const generated = draft.goals.some((g) => g.content);
    return (
      <Page
        title="Lernziele prüfen"
        back={TASKS}
        className="stack-new"
        actions={<IconButton icon="trash" label="Entwurf verwerfen" onClick={() => setConfirmDiscard(true)} />}
      >
        <p className="notice notice--info stack-review-note">
          {generated
            ? `Phoni hat ${goalCount(draft.goals.length)} mit dem Kernstoff formuliert. Sie sind die Grundlage für alle Tests und Aufgaben – bitte prüfe und ergänze sie.`
            : 'Schreib die Lernziele und den Stoff dazu – daraus entstehen die Tests und Aufgaben.'}
          {unsure > 0 && ` ${unsure === 1 ? 'Eines ist' : `${unsure} sind`} gelb markiert.`}
          {draft.removedPersonalData && ' Namen und Noten habe ich weggelassen.'}
        </p>
        <TopicEditor
          value={draft}
          invalid={invalid}
          onChange={(value) => {
            setInvalid(false);
            updateDraft(value);
          }}
        />
        <div className="danger-zone">
          <Button variant="ghost" icon="trash" onClick={() => setConfirmDiscard(true)}>
            Entwurf verwerfen
          </Button>
        </div>
        <BottomBar>
          <Button size="lg" block icon="check" onClick={save}>
            Thema speichern
          </Button>
        </BottomBar>
        <ConfirmSheet
          open={confirmDiscard}
          onClose={() => setConfirmDiscard(false)}
          title="Entwurf verwerfen?"
          message="Die Lernziele gehen verloren. Eine neue Auswertung zählt wieder ans Monatslimit."
          confirmLabel="Verwerfen"
          danger
          onConfirm={() => {
            const discarded = useTopicDraft.getState().draft;
            setConfirmDiscard(false);
            setDraft(null);
            setStep('input');
            if (discarded) {
              withUndo(
                'Entwurf verworfen.',
                () => {
                  setDraft(discarded);
                  setStep('review');
                },
                'Entwurf ist wieder da.',
              );
            }
          }}
        />
      </Page>
    );
  }

  const unavailable = usage !== null && !usage.available;
  const used = usage !== null && usage.available && usage.remaining <= 0;
  const blocked = !online || unavailable || used;
  const ready = photos.length > 0 || notes.trim().length >= 3;
  return (
    <Page title="Neues Thema" subtitle="Lernziele, Buchseiten oder Stichworte – Phoni macht Lernziele daraus." back={TASKS} className="stack-new">
      <Section title="Fotos">
        <PhotoGrid photos={photos} setPhotos={setPhotos} preparing={preparing} setPreparing={setPreparing} disabled={blocked} onError={setError} />
        <p className="settings-panel__hint">Am besten das Blatt mit den Lernzielen, dazu Buchseiten oder Arbeitsblätter.</p>
      </Section>

      <Section title="Stichworte">
        <div className="field">
          <textarea
            className="text-import topic-notes"
            aria-label="Stichworte zum Thema"
            value={notes}
            rows={4}
            maxLength={2000}
            autoFocus={params.get('stichworte') === '1'}
            placeholder={'z. B. Die Römer: Gründung Roms, Republik, Kaiserzeit, Alltag in Rom, Römer in der Schweiz'}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="field__hint">Mit Fotos: was die Lehrperson betont hat. Ohne Fotos: das Thema und was dazugehört.</p>
        </div>
      </Section>

      <Section title="Für wen">
        <div className="form stack-meta">
          <LevelField value={level} onChange={setLevel} />
          <TextField
            label="Fach (freiwillig)"
            icon="cards"
            value={subject}
            maxLength={40}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="z. B. Geschichte"
          />
        </div>
        {usage?.available && (
          <p className={`usage-pill ${usage.remaining <= 1 ? 'is-low' : ''}`}>
            {usage.remaining > 0 ? `Noch ${usage.remaining} von ${usage.limit} Auswertungen diesen Monat` : `Alle ${usage.limit} Auswertungen gebraucht`}
          </p>
        )}
        {!online && <p className="notice notice--warn">Für die Auswertung brauchst du Internet. Lernziele selbst schreiben geht auch offline.</p>}
        {unavailable && <p className="notice notice--warn">Die KI-Auswertung ist noch nicht eingerichtet. Du kannst die Lernziele selbst schreiben.</p>}
        {error && <p className="notice notice--error">{error}</p>}
        <p className="privacy-note">
          <Icon name="shield" size={16} />
          <span>Fotos werden in der Schweiz ausgewertet und danach gelöscht. Bitte keine Namen oder Noten fotografieren.</span>
        </p>
      </Section>

      <div className="stack-new__alt">
        <span>oder</span>
        <Button variant="ghost" block icon="edit" onClick={writeOwn}>
          Lernziele selbst schreiben
        </Button>
      </div>

      <BottomBar>
        <Button size="lg" block icon="sparkles" onClick={() => void analyse()} disabled={!ready || blocked || preparing > 0}>
          Lernziele erstellen
        </Button>
      </BottomBar>
    </Page>
  );
}

/* ----------------------------------------------------------------- topic */

/** /aufgaben/:topicId – the learning goals of a topic and what is made from them. */
export function TopicPage() {
  const { topicId } = useParams();
  const topic = useTopic(topicId);

  if (!topic) {
    return (
      <Page title="Thema" back={TASKS}>
        <EmptyState emoji="🤷" title="Thema nicht gefunden" text="Vielleicht wurde es gelöscht." />
      </Page>
    );
  }

  const exam = examLabel(topic.examDate);
  return (
    <Page
      title={topic.title}
      subtitle={`${subjectEmoji(topic.subject)} ${[topic.subject, topic.level].filter(Boolean).join(' · ')}`}
      back={TASKS}
      className="topic-page"
      actions={
        <Link to={`/aufgaben/${topic.id}/bearbeiten`} className="icon-btn" aria-label="Thema bearbeiten" viewTransition>
          <Icon name="edit" />
        </Link>
      }
    >
      {topic.examDate && (
        <p className="topic-exam">
          <span aria-hidden="true">🗓️</span> Prüfung am {examDateLabel(topic.examDate)}
          {exam && <span className="exam-pill">{exam.replace('Prüfung ', '')}</span>}
        </p>
      )}

      <Section title={`Lernziele (${topic.goals.length})`}>
        <ol className="goal-view">
          {topic.goals.map((goal, i) => (
            <li key={goal.id}>
              <details>
                <summary>
                  <span className="goal-view__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{goal.text}</span>
                </summary>
                {goal.content ? <p className="goal-view__content">{goal.content}</p> : <p className="goal-view__content is-empty">Kein Kernstoff erfasst.</p>}
              </details>
            </li>
          ))}
        </ol>
      </Section>
    </Page>
  );
}

/** /aufgaben/:topicId/bearbeiten – change goals, level, the day of the test. */
export function TopicEditPage() {
  const { topicId } = useParams();
  const topic = useTopic(topicId);
  const navigate = useNavigate();
  const saveTopic = useData((s) => s.saveTopic);
  const [value, setValue] = useState<TopicEditorValue | null>(() => (topic ? fromTopic(topic) : null));
  const [invalid, setInvalid] = useState(false);

  if (!topic || !value) return <Navigate to={TASKS} replace />;

  const save = () => {
    const input = toTopicInput(value);
    if (input.goals.length === 0) {
      setInvalid(true);
      haptic([30, 40, 30]);
      return;
    }
    saveTopic(input, topic.id);
    toast('Gespeichert.', { tone: 'success' });
    navigate(`/aufgaben/${topic.id}`, { replace: true, viewTransition: true });
  };

  return (
    <Page title="Thema bearbeiten" back={`/aufgaben/${topic.id}`} className="stack-new">
      <TopicEditor
        value={value}
        invalid={invalid}
        onChange={(next) => {
          setInvalid(false);
          setValue(next);
        }}
      />
      <div className="danger-zone">
        <Button
          variant="ghost"
          icon="trash"
          onClick={() => {
            deleteTopicWithUndo(topic);
            navigate(TASKS, { replace: true, viewTransition: true });
          }}
        >
          Thema löschen
        </Button>
      </div>
      <BottomBar>
        <Button size="lg" block icon="check" onClick={save}>
          Speichern
        </Button>
      </BottomBar>
    </Page>
  );
}
