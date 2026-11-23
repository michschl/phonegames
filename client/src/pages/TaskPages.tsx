import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import type { LearnTopic, LearnUsage, TaskDocKind, TaskDocRequest, TaskDocument, TaskUsage } from '../../../shared/types.ts';
import { DocTaskView } from '../components/DocTaskView.tsx';
import { Mascot } from '../components/Brand.tsx';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomBar, Page, Section } from '../components/Layout.tsx';
import { PhotoGrid, type Photo } from '../components/PhotoGrid.tsx';
import { LevelField, TopicEditor } from '../components/TopicEditor.tsx';
import { ActionSheet, Button, ConfirmSheet, EmptyState, IconButton, Segmented, Sheet, TextField } from '../components/ui.tsx';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { nextMove } from '../lib/transition.ts';
import { subjectEmoji } from '../lib/learn.ts';
import { documentMeta, KIND_INFO } from '../lib/taskDocs.ts';
import { attemptSummary, goalStatus, GOAL_LEVEL, latestAttempt, weakGoals } from '../lib/taskResults.ts';
import type { PdfVariant } from '../lib/taskPdf.ts';
import { daysUntil, examDateLabel, examLabel } from '../lib/topics.ts';
import {
  createDocument,
  deleteAttempt,
  deleteDocument,
  flushAttempts,
  loadDocument,
  loadDocuments,
  useDocuments,
  usePollPending,
  useTopicDocuments,
} from '../store/documents.ts';
import { fromDraft, useLearnDraft } from '../store/learnDraft.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useTopic, useTopics } from '../store/data.ts';
import { useGameSettings, useSettings } from '../store/settings.ts';
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
  useEffect(() => {
    if (useSettings.getState().learnArea !== area) setLearnArea(area);
  }, [area, setLearnArea]);
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
          if (value !== area) nextMove(value === 'aufgaben' ? 'right' : 'left');
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
    <Page
      title="Lernen"
      subtitle={topics.length > 0 ? 'Prüfungen vorbereiten – mit Tests, Aufgaben und Probeprüfungen.' : undefined}
      nav={<LearnAreaSwitch area="aufgaben" />}
    >
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
  const online = useUi((s) => s.online);
  const documents = useTopicDocuments(topicId);
  usePollPending(documents);
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id ?? '');
  const [cardsOpen, setCardsOpen] = useState(false);
  const [cardCount, setCardCount] = useState('20');
  const [cardsBusy, setCardsBusy] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const status = useMemo(() => (topic ? goalStatus(topic, documents) : {}), [topic, documents]);

  useEffect(() => {
    if (!topicId || !online) return;
    void flushAttempts().then(() => loadDocuments(topicId).catch(() => undefined));
  }, [topicId, online]);

  if (!topic) {
    return (
      <Page title="Thema" back={TASKS}>
        <EmptyState emoji="🤷" title="Thema nicht gefunden" text="Vielleicht wurde es gelöscht." />
      </Page>
    );
  }

  const exam = examLabel(topic.examDate);
  const weak = weakGoals(topic, status);
  const tested = Object.values(status).some((g) => g.level !== 'offen');

  const makeCards = async () => {
    setCardsBusy(true);
    setCardsError(null);
    sound.unlock();
    try {
      const { draft } = await api.topicCards({
        topic: { title: topic.title, subject: topic.subject, level: topic.level, goals: topic.goals },
        goalIds: [],
        count: Number(cardCount),
      });
      useLearnDraft.getState().setDraft({ ...fromDraft(draft, 'text'), ownerId: userId });
      sound.sparkle();
      setCardsOpen(false);
      navigate('/stapel/neu', { viewTransition: true });
    } catch (err) {
      setCardsError(errorMessage(err));
      sound.fail();
    } finally {
      setCardsBusy(false);
    }
  };

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
          {topic.goals.map((goal, i) => {
            const goalState = status[goal.id];
            const level = goalState && goalState.level !== 'offen' ? GOAL_LEVEL[goalState.level] : null;
            return (
            <li key={goal.id}>
              <details>
                <summary>
                  <span className="goal-view__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    {goal.text}
                    {level && (
                      <span className={`goal-status__badge is-${goalState!.level}`}>
                        {level.emoji} {level.label}
                      </span>
                    )}
                  </span>
                </summary>
                {goal.content ? <p className="goal-view__content">{goal.content}</p> : <p className="goal-view__content is-empty">Kein Kernstoff erfasst.</p>}
              </details>
            </li>
            );
          })}
        </ol>
        {tested && (
          <p className="goal-summary">
            {weak.length === 0
              ? 'Nach den letzten Ergebnissen sitzen alle geprüften Lernziele. 🎉'
              : `Nach den letzten Ergebnissen ${weak.length === 1 ? 'braucht ein Lernziel' : `brauchen ${weak.length} Lernziele`} noch Übung.`}
          </p>
        )}
        <div className="topic-tools">
          {weak.length > 0 && (
            <Link to={`/aufgaben/${topic.id}/unterlage?ziele=${weak.join(',')}`} className="btn btn--secondary btn--block" viewTransition>
              <Icon name="refresh" size={18} />
              <span>Gezielt üben</span>
            </Link>
          )}
          <Button variant="secondary" block icon="cards" onClick={() => setCardsOpen(true)}>
            Lernkarten daraus machen
          </Button>
        </div>
      </Section>

      <Section title="Unterlagen">
        {documents.length === 0 ? (
          <p className="learn-hub__calm">Noch keine. Erstelle einen Wissenstest, Übungsaufgaben oder eine Probeprüfung – zum Ausdrucken oder Lösen in der App.</p>
        ) : (
          <div className="group-list">
            {documents.map((doc) => (
              <Link key={doc.id} to={`/aufgaben/${topic.id}/${doc.id}`} className="group-card doc-card" viewTransition>
                <span className="group-card__emoji" aria-hidden="true">
                  {KIND_INFO[doc.kind].emoji}
                </span>
                <span className="group-card__body">
                  <span className="group-card__name">{doc.title}</span>
                  <span className="group-card__count">
                    {doc.status === 'pending'
                      ? 'Phoni schreibt …'
                      : doc.status === 'failed'
                        ? 'Hat nicht geklappt'
                        : latestAttempt(doc)
                          ? `${documentMeta(doc)} · zuletzt ${attemptSummary(doc, latestAttempt(doc)!)}`
                          : `${documentMeta(doc)} · ${new Date(doc.createdAt).toLocaleDateString('de-CH')}`}
                  </span>
                </span>
                {doc.status === 'pending' && <span className="spinner" aria-label="wird erstellt" />}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <BottomBar>
        <Link to={`/aufgaben/${topic.id}/unterlage`} className="btn btn--primary btn--lg btn--block" viewTransition>
          <Icon name="sparkles" size={20} />
          <span>Unterlage erstellen</span>
        </Link>
      </BottomBar>

      <Sheet open={cardsOpen} onClose={() => !cardsBusy && setCardsOpen(false)} title="Lernkarten daraus machen">
        <p className="sheet__text">
          Phoni schreibt Lernkarten zum Kernstoff der Lernziele – für den Kartenkasten, das Duell und die anderen Spielformen. Du prüfst sie, bevor
          sie gespeichert werden. Zählt als eine Auswertung.
        </p>
        <div className="settings-panel__group">
          <span className="settings-panel__label">Wie viele Karten?</span>
          <Segmented
            label="Wie viele Karten?"
            value={cardCount}
            options={['10', '20', '30'].map((n) => ({ value: n, label: n }))}
            onChange={setCardCount}
          />
        </div>
        {!online && <p className="notice notice--warn">Dafür brauchst du Internet.</p>}
        {cardsError && <p className="notice notice--error">{cardsError}</p>}
        <Button size="lg" block icon="sparkles" loading={cardsBusy} disabled={!online} onClick={() => void makeCards()}>
          {cardsBusy ? 'Phoni schreibt Karten …' : 'Karten erstellen'}
        </Button>
      </Sheet>
    </Page>
  );
}

/* ------------------------------------------------------------ documents */

const DIFFICULTIES = [
  { value: 'easy', label: 'Grundlagen' },
  { value: 'mixed', label: 'Gemischt' },
  { value: 'hard', label: 'Knifflig' },
] as const;

interface DocChoice {
  kind: TaskDocKind;
  durationMin: 15 | 30 | 45;
  difficulty: TaskDocRequest['difficulty'];
}

/** Asks the server to write a document; shows how many are left this month. */
async function startDocument(topic: LearnTopic, choice: DocChoice, goalIds: string[]): Promise<TaskDocument> {
  return createDocument({
    topicId: topic.id,
    topic: { title: topic.title, subject: topic.subject, level: topic.level, goals: topic.goals },
    ...choice,
    goalIds,
  });
}

/** /aufgaben/:topicId/unterlage – what to make: test, tasks or practice exam; time, difficulty, goals. */
export function NewDocumentPage() {
  const { topicId } = useParams();
  const topic = useTopic(topicId);
  const navigate = useNavigate();
  const online = useUi((s) => s.online);
  const [params] = useSearchParams();
  const [choice, setChoice] = useGameSettings<DocChoice>('aufgaben-unterlage', { kind: 'quiz', durationMin: 15, difficulty: 'mixed' });
  // «Gezielt üben» comes with the goals that need practice.
  const [goalIds, setGoalIds] = useState<string[]>(() => {
    const all = topic?.goals.map((g) => g.id) ?? [];
    const wanted = (params.get('ziele') ?? '').split(',').filter((id) => all.includes(id));
    return wanted.length > 0 ? wanted : all;
  });
  const [usage, setUsage] = useState<TaskUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    api
      .taskUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [online]);

  if (!topic) return <Navigate to={TASKS} replace />;

  const create = async () => {
    setBusy(true);
    setError(null);
    sound.unlock();
    try {
      const doc = await startDocument(topic, choice, goalIds);
      sound.sparkle();
      navigate(`/aufgaben/${topic.id}/${doc.id}`, { replace: true, viewTransition: true });
    } catch (err) {
      setError(errorMessage(err));
      sound.fail();
      setBusy(false);
    }
  };

  const allGoals = goalIds.length === topic.goals.length;
  const blocked = !online || (usage !== null && (!usage.available || usage.remaining <= 0));
  return (
    <Page title="Unterlage erstellen" subtitle={`«${topic.title}»`} back={`/aufgaben/${topic.id}`} className="stack-new">
      <Section title="Was brauchst du?">
        <div className="mode-picker doc-kinds" role="radiogroup" aria-label="Art der Unterlage">
          {(Object.keys(KIND_INFO) as TaskDocKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={choice.kind === kind}
              className={`mode-option ${choice.kind === kind ? 'is-active' : ''}`}
              onClick={() => {
                haptic(6);
                setChoice({ ...choice, kind });
              }}
            >
              <span className="mode-option__emoji" aria-hidden="true">
                {KIND_INFO[kind].emoji}
              </span>
              <span className="mode-option__label">{KIND_INFO[kind].label}</span>
              <span className="mode-option__hint">{KIND_INFO[kind].text}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Einstellungen">
        <div className="settings-panel">
          <div className="settings-panel__group">
            <span className="settings-panel__label">Dauer</span>
            <Segmented
              label="Dauer"
              value={String(choice.durationMin)}
              options={[15, 30, 45].map((n) => ({ value: String(n), label: `${n} Min.` }))}
              onChange={(value) => setChoice({ ...choice, durationMin: Number(value) as DocChoice['durationMin'] })}
            />
          </div>
          <div className="settings-panel__group">
            <span className="settings-panel__label">Schwierigkeit</span>
            <Segmented
              label="Schwierigkeit"
              value={choice.difficulty}
              options={DIFFICULTIES.map((d) => ({ ...d }))}
              onChange={(difficulty) => setChoice({ ...choice, difficulty })}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Lernziele"
        action={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setGoalIds(allGoals ? [] : topic.goals.map((g) => g.id))}>
            {allGoals ? 'Keine' : 'Alle'}
          </button>
        }
      >
        <ul className="goal-picks">
          {topic.goals.map((goal, i) => (
            <li key={goal.id}>
              <label className="consent__label">
                <input
                  type="checkbox"
                  className="consent__box"
                  checked={goalIds.includes(goal.id)}
                  onChange={(e) => setGoalIds((ids) => (e.target.checked ? [...ids, goal.id] : ids.filter((id) => id !== goal.id)))}
                />
                <span>
                  <strong>{i + 1}.</strong> {goal.text}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {usage?.available && (
          <p className={`usage-pill ${usage.remaining <= 2 ? 'is-low' : ''}`}>
            {usage.remaining > 0 ? `Noch ${usage.remaining} von ${usage.limit} Unterlagen diesen Monat` : `Alle ${usage.limit} Unterlagen gebraucht`}
          </p>
        )}
        {!online && <p className="notice notice--warn">Für neue Unterlagen brauchst du Internet.</p>}
        {usage && !usage.available && <p className="notice notice--warn">Die KI ist noch nicht eingerichtet.</p>}
        {error && <p className="notice notice--error">{error}</p>}
      </Section>

      <BottomBar>
        <Button size="lg" block icon="sparkles" loading={busy} disabled={blocked || goalIds.length === 0} onClick={() => void create()}>
          {KIND_INFO[choice.kind].label} erstellen
        </Button>
      </BottomBar>
    </Page>
  );
}

const PDF_OPTIONS: { variant: PdfVariant; label: string; hint: string }[] = [
  { variant: 'both', label: 'Aufgaben und Lösungen', hint: 'Die Lösungen beginnen auf einer neuen Seite.' },
  { variant: 'tasks', label: 'Nur Aufgaben', hint: 'Zum Lösen auf Papier.' },
  { variant: 'solutions', label: 'Nur Lösungen', hint: 'Zum Korrigieren.' },
];

/** /aufgaben/:topicId/:docId – a document: preview with or without solutions, PDF, a new version. */
export function DocumentPage() {
  const { topicId, docId } = useParams();
  const topic = useTopic(topicId);
  const navigate = useNavigate();
  const online = useUi((s) => s.online);
  const doc = useDocuments((s) => (docId ? s.docs[docId] : undefined));
  const [solutions, setSolutions] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [missing, setMissing] = useState(false);
  const [removeAttempt, setRemoveAttempt] = useState<string | null>(null);
  usePollPending(doc ? [doc] : []);

  useEffect(() => {
    if (!docId || !online) return;
    void flushAttempts()
      .then(() => loadDocument(docId))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setMissing(true);
      });
  }, [docId, online]);

  if (!topic || missing) return <Navigate to={topic ? `/aufgaben/${topic.id}` : TASKS} replace />;
  if (!doc) {
    return (
      <Page title="Unterlage" back={`/aufgaben/${topic.id}`}>
        <p className="reading__text" role="status">
          {online ? 'Einen Moment …' : 'Diese Unterlage ist auf diesem Gerät noch nicht gespeichert. Öffne sie einmal mit Internet.'}
        </p>
      </Page>
    );
  }

  const again = async () => {
    try {
      const next = await startDocument(
        topic,
        { kind: doc.kind, durationMin: doc.durationMin as DocChoice['durationMin'], difficulty: doc.difficulty },
        doc.goalIds,
      );
      navigate(`/aufgaben/${topic.id}/${next.id}`, { replace: true, viewTransition: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await deleteDocument(doc.id);
      toast('Unterlage gelöscht.');
      navigate(`/aufgaben/${topic.id}`, { replace: true, viewTransition: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  const pdf = async (variant: PdfVariant) => {
    setPdfBusy(true);
    try {
      const { exportPdf } = await import('../lib/taskPdf.ts');
      const result = await exportPdf(doc, topic, variant);
      setPdfOpen(false);
      if (result === 'downloaded') toast('PDF gespeichert.', { tone: 'success' });
    } catch {
      toast('Das PDF konnte nicht erstellt werden.', { tone: 'error' });
    } finally {
      setPdfBusy(false);
    }
  };

  const header = {
    title: doc.title,
    subtitle: doc.status === 'ready' ? documentMeta(doc) : KIND_INFO[doc.kind].label,
    back: `/aufgaben/${topic.id}`,
    actions: <IconButton icon="trash" label="Unterlage löschen" onClick={() => setConfirmDelete(true)} />,
  };
  const deleteSheet = (
    <ConfirmSheet
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      title="Unterlage löschen?"
      message="Sie verschwindet auf allen Geräten."
      confirmLabel="Löschen"
      danger
      onConfirm={() => void remove()}
    />
  );

  if (doc.status === 'pending') {
    return (
      <Page {...header} className="stack-new">
        <div className="reading" role="status" aria-live="polite">
          <Mascot size={150} mood="wow" />
          <p className="reading__title">Phoni schreibt die Aufgaben …</p>
          <p className="reading__text">Das dauert etwa eine Minute. Du kannst die Seite verlassen – die Unterlage erscheint beim Thema.</p>
          <span className="reading__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
        {deleteSheet}
      </Page>
    );
  }

  if (doc.status === 'failed') {
    return (
      <Page {...header}>
        <EmptyState
          mascot="oops"
          emoji="🫣"
          title="Das hat nicht geklappt"
          text={doc.error || 'Versuch es nochmals.'}
          action={
            <Button icon="refresh" onClick={() => void again()} disabled={!online}>
              Nochmals versuchen
            </Button>
          }
        />
        {deleteSheet}
      </Page>
    );
  }

  return (
    <Page {...header} className="doc-page">
      <div className="learn-area">
        <Segmented
          label="Ansicht"
          value={solutions ? 'loesungen' : 'aufgaben'}
          options={[
            { value: 'aufgaben', label: 'Aufgaben' },
            { value: 'loesungen', label: 'Mit Lösungen' },
          ]}
          onChange={(value) => setSolutions(value === 'loesungen')}
        />
      </div>
      {doc.intro && <p className="doc-intro">{doc.intro}</p>}
      <ol className="doc-tasks">
        {doc.tasks.map((task, i) => (
          <DocTaskView key={task.id} task={task} index={i} solution={solutions} />
        ))}
      </ol>
      <p className="privacy-note">
        <Icon name="sparkles" size={16} />
        <span>Aufgaben und Musterlösungen hat Phoni erstellt und einmal kontrolliert. Auch eine KI irrt sich – bitte überfliege sie vor dem Drucken.</span>
      </p>
      <Section title="Ergebnisse">
        {doc.attempts.length === 0 ? (
          <p className="learn-hub__calm">Noch keine. Löse die Unterlage in der App – oder trag nach dem Lösen auf Papier die Punkte ein.</p>
        ) : (
          <ul className="attempt-list">
            {[...doc.attempts].reverse().map((attempt) => (
              <li key={attempt.id} className="attempt-row">
                <span className="attempt-row__icon" aria-hidden="true">
                  {attempt.mode === 'app' ? '📱' : '📄'}
                </span>
                <span className="attempt-row__text">
                  <strong>{attemptSummary(doc, attempt)}</strong>
                  <small>
                    {[attempt.learner, new Date(attempt.at).toLocaleDateString('de-CH'), attempt.mode === 'app' ? 'in der App' : 'auf Papier'].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <IconButton icon="trash" label="Ergebnis löschen" onClick={() => setRemoveAttempt(attempt.id)} />
              </li>
            ))}
          </ul>
        )}
        <Link to={`/aufgaben/${topic.id}/${doc.id}/ergebnis`} className="btn btn--secondary btn--block" viewTransition>
          <Icon name="edit" size={18} />
          <span>Ergebnis vom Papier eintragen</span>
        </Link>
      </Section>
      <div className="doc-actions">
        <Button variant="ghost" block icon="refresh" onClick={() => void again()} disabled={!online}>
          Neue Version mit anderen Aufgaben
        </Button>
      </div>
      <BottomBar>
        <div className="solve-nav">
          <Button variant="secondary" icon="download" onClick={() => setPdfOpen(true)}>
            PDF
          </Button>
          <Link to={`/aufgaben/${topic.id}/${doc.id}/loesen`} className="btn btn--primary" viewTransition>
            <Icon name="play" size={18} />
            <span>In der App lösen</span>
          </Link>
        </div>
      </BottomBar>
      <ConfirmSheet
        open={removeAttempt !== null}
        onClose={() => setRemoveAttempt(null)}
        title="Ergebnis löschen?"
        message="Es zählt dann nicht mehr für die Lernziele."
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          const id = removeAttempt;
          setRemoveAttempt(null);
          if (id) deleteAttempt(doc.id, id).catch((err) => toast(errorMessage(err), { tone: 'error' }));
        }}
      />
      <Sheet open={pdfOpen} onClose={() => setPdfOpen(false)} title="Als PDF">
        <div className="action-list">
          {PDF_OPTIONS.map((option) => (
            <button key={option.variant} type="button" className="action-list__item" disabled={pdfBusy} onClick={() => void pdf(option.variant)}>
              <Icon name="download" />
              <span className="list__label">
                {option.label}
                <small className="list__sub">{option.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </Sheet>
      {deleteSheet}
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
