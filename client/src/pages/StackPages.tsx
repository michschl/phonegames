import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LIMITS, type LearnUsage } from '../../../shared/types.ts';
import { Mascot } from '../components/Brand.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomBar, Page, Section } from '../components/Layout.tsx';
import { ShareStack } from '../components/ShareStack.tsx';
import { StackEditor, toStackInput } from '../components/StackEditor.tsx';
import { Button, ConfirmSheet, EmptyState } from '../components/ui.tsx';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { haptic } from '../lib/device.ts';
import { parseTextCards, preparePhoto, subjectEmoji } from '../lib/learn.ts';
import { sound } from '../lib/audio.ts';
import { createId } from '../lib/util.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useDueByStack, useStack, useStacks } from '../store/data.ts';
import { fromDraft, fromStack, useLearnDraft, type EditorValue } from '../store/learnDraft.ts';
import { toast, useUi } from '../store/ui.ts';

/** Where the learning game lives – stacks are chosen and played there. */
const GAME = '/spiel/spickzettel';

function cardCount(n: number): string {
  return `${n} ${n === 1 ? 'Karte' : 'Karten'}`;
}

/** «1. Dezember» from 2026-12-01. */
function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('de-CH', { day: 'numeric', month: 'long' });
}

/* ------------------------------------------------------------- overview */

export function StacksPage() {
  const stacks = useStacks();
  const dueByStack = useDueByStack();
  return (
    <Page
      title="Lernstapel"
      subtitle="Dein Lernstoff als Karten – für den Kartenkasten und die Blitzrunde."
      back={GAME}
      actions={
        stacks.length > 0 && (
          <Link to="/stapel/neu" className="icon-btn icon-btn--accent" aria-label="Neuer Stapel" viewTransition>
            <Icon name="plus" />
          </Link>
        )
      }
    >
      {stacks.length === 0 ? (
        <EmptyState
          mascot="happy"
          emoji="📝"
          title="Noch kein Lernstapel"
          text="Fotografiere ein Wörtliblatt oder eine Heftseite – Phoni macht Lernkarten daraus."
          action={
            <Link to="/stapel/neu" className="btn btn--primary btn--lg" viewTransition>
              <Icon name="camera" size={20} />
              <span>Stapel erstellen</span>
            </Link>
          }
        />
      ) : (
        <div className="group-list">
          {stacks.map((stack, i) => (
            <Link key={stack.id} to={`/stapel/${stack.id}`} className="group-card" style={{ animationDelay: `${i * 60}ms` }} viewTransition>
              <span className="group-card__emoji" aria-hidden="true">
                {subjectEmoji(stack.subject)}
              </span>
              <span className="group-card__body">
                <span className="group-card__name">{stack.title}</span>
                <span className="group-card__count">
                  {cardCount(stack.cards.length)}
                  {stack.subject && ` · ${stack.subject}`}
                </span>
                {(dueByStack[stack.id] ?? 0) > 0 && <span className="due-pill">{dueByStack[stack.id]} fällig</span>}
              </span>
              <Icon name="next" />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------ new stack */

interface Photo {
  id: string;
  url: string;
}

type Step = 'pick' | 'text' | 'reading' | 'review';

export function NewStackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const userId = useAuth((s) => s.user?.id ?? '');
  const online = useUi((s) => s.online);
  const saveStack = useData((s) => s.saveStack);
  const storedDraft = useLearnDraft((s) => s.draft);
  const setDraft = useLearnDraft((s) => s.setDraft);
  const draft = storedDraft && storedDraft.ownerId === userId ? storedDraft : null;

  const [step, setStep] = useState<Step>(() => (draft ? 'review' : params.get('text') ? 'text' : 'pick'));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [usage, setUsage] = useState<LearnUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [invalidIndex, setInvalidIndex] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!online) return;
    api
      .learnUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [online]);

  const updateDraft = (value: EditorValue) => setDraft({ ...value, ownerId: userId });

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const free = LIMITS.learnPhotos - photos.length;
    const chosen = Array.from(files).slice(0, free);
    if (files.length > free) toast(`Höchstens ${LIMITS.learnPhotos} Fotos pro Auswertung.`);
    setPreparing((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const url = await preparePhoto(file);
        setPhotos((list) => [...list, { id: createId(), url }]);
        sound.tap();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Das Foto konnte nicht gelesen werden.');
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  };

  const analyse = async () => {
    if (photos.length === 0) return;
    setError(null);
    setStep('reading');
    sound.unlock();
    try {
      const result = await api.learnExtract(photos.map((p) => p.url));
      setUsage(result.usage);
      updateDraft(fromDraft(result.draft, 'photo'));
      setPhotos([]);
      sound.sparkle();
      haptic([20, 40, 20]);
      setStep('review');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'learn_limit') setUsage((u) => (u ? { ...u, remaining: 0 } : u));
      setError(errorMessage(err));
      sound.fail();
      setStep('pick');
    }
  };

  const fromText = () => {
    const cards = parseTextCards(text);
    if (cards.length === 0) {
      setTextError('Keine Karten erkannt. Schreib pro Zeile zum Beispiel «le chien = der Hund».');
      return;
    }
    updateDraft(
      fromDraft({ title: '', subject: '', languages: [], cards, suggestedModes: ['blitz', 'kasten'], removedPersonalData: false }, 'text'),
    );
    setText('');
    setStep('review');
  };

  const save = () => {
    if (!draft) return;
    const input = toStackInput(draft);
    if ('incomplete' in input) {
      setInvalidIndex(input.incomplete);
      document.querySelector(`[data-index="${input.incomplete}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      haptic([30, 40, 30]);
      return;
    }
    if ('empty' in input) {
      toast('Der Stapel braucht mindestens eine Karte.', { tone: 'error' });
      return;
    }
    const stack = saveStack(input);
    setDraft(null);
    sound.fanfare();
    toast(`«${stack.title}» ist gespeichert 🎉`, { tone: 'success' });
    navigate(`${GAME}?stapel=${stack.id}`, { replace: true, viewTransition: true });
  };

  if (step === 'reading') {
    return (
      <Page title="Neuer Stapel" className="stack-new">
        <div className="reading" role="status" aria-live="polite">
          <Mascot size={150} mood="wow" />
          <p className="reading__title">Phoni liest deine Fotos …</p>
          <p className="reading__text">Das dauert etwa 10 Sekunden.</p>
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
    const unsure = draft.cards.filter((c) => c.uncertain).length;
    return (
      <Page title="Karten prüfen" back={GAME} className="stack-new">
        <p className="notice notice--info stack-review-note">
          {draft.source === 'photo' ? `Phoni hat ${cardCount(draft.cards.length)} erkannt.` : `${cardCount(draft.cards.length)} erkannt.`}{' '}
          {unsure > 0 ? `Bitte prüfe sie kurz – besonders die ${unsure} gelb markierten.` : 'Bitte prüfe sie kurz.'}
          {draft.removedPersonalData && ' Namen und Noten habe ich weggelassen.'}
        </p>
        <StackEditor
          value={draft}
          invalidIndex={invalidIndex}
          onChange={(value) => {
            setInvalidIndex(null);
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
            Stapel speichern
          </Button>
        </BottomBar>
        <ConfirmSheet
          open={confirmDiscard}
          onClose={() => setConfirmDiscard(false)}
          title="Entwurf verwerfen?"
          message="Die erkannten Karten gehen verloren. Eine neue Auswertung zählt wieder ans Monatslimit."
          confirmLabel="Verwerfen"
          danger
          onConfirm={() => {
            setDraft(null);
            setStep('pick');
          }}
        />
      </Page>
    );
  }

  if (step === 'text') {
    return (
      <Page title="Karten abtippen" back={GAME} className="stack-new">
        <Section title="Eine Karte pro Zeile">
          <div className={`field ${textError ? 'has-error' : ''}`}>
            <textarea
              className="text-import"
              aria-label="Karten, eine pro Zeile"
              aria-invalid={!!textError}
              value={text}
              rows={10}
              placeholder={'le chien = der Hund\nla maison = das Haus\nHauptort von Bern? = Bern'}
              onChange={(e) => {
                setText(e.target.value);
                setTextError(null);
              }}
            />
            {textError ? (
              <p className="field__error">{textError}</p>
            ) : (
              <p className="field__hint">Trenne Frage und Antwort mit «=», «–» oder einem Tabulator. Du kannst auch eine Liste einfügen.</p>
            )}
          </div>
        </Section>
        <BottomBar>
          <Button size="lg" block icon="check" onClick={fromText}>
            Karten erstellen
          </Button>
        </BottomBar>
      </Page>
    );
  }

  const unavailable = usage !== null && !usage.available;
  const used = usage !== null && usage.available && usage.remaining <= 0;
  const blocked = !online || unavailable || used;
  return (
    <Page title="Neuer Stapel" subtitle="Fotografiere dein Wörtliblatt oder deine Heftseite." back={GAME} className="stack-new">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <Section title="Fotos">
        <div className="photo-grid">
          {photos.map((photo, i) => (
            <div key={photo.id} className="photo-tile">
              <img src={photo.url} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="photo-tile__remove"
                aria-label={`Foto ${i + 1} entfernen`}
                onClick={() => setPhotos((list) => list.filter((p) => p.id !== photo.id))}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          {Array.from({ length: preparing }, (_, i) => (
            <div key={`prep-${i}`} className="photo-tile is-loading" aria-label="Foto wird vorbereitet">
              <span className="spinner" aria-hidden="true" />
            </div>
          ))}
          {photos.length + preparing < LIMITS.learnPhotos && !blocked && (
            <button type="button" className="photo-tile photo-tile--add" onClick={() => fileInput.current?.click()}>
              <Icon name="camera" size={28} />
              <span>{photos.length === 0 ? 'Foto aufnehmen' : 'Weitere Seite'}</span>
            </button>
          )}
        </div>

        {usage?.available && (
          <p className={`usage-pill ${usage.remaining <= 1 ? 'is-low' : ''}`}>
            {usage.remaining > 0
              ? `Noch ${usage.remaining} von ${usage.limit} Auswertungen diesen Monat`
              : `Alle ${usage.limit} Auswertungen gebraucht – ab ${dayLabel(usage.resetsOn)} wieder`}
          </p>
        )}
        {!online && <p className="notice notice--warn">Für die Foto-Auswertung brauchst du Internet. Abtippen geht auch offline.</p>}
        {unavailable && (
          <p className="notice notice--warn">Die Foto-Auswertung ist noch nicht eingerichtet. Du kannst die Karten abtippen.</p>
        )}
        {error && <p className="notice notice--error">{error}</p>}
        <p className="privacy-note">
          <Icon name="shield" size={16} />
          <span>Deine Fotos werden in der Schweiz ausgewertet und danach gelöscht. Bitte keine Namen oder Noten fotografieren.</span>
        </p>
      </Section>

      <div className="stack-new__alt">
        <span>oder</span>
        <Button variant="secondary" block icon="text" onClick={() => setStep('text')}>
          Karten abtippen
        </Button>
      </div>

      {photos.length > 0 && !blocked && (
        <BottomBar>
          <Button size="lg" block icon="sparkles" onClick={() => void analyse()} disabled={preparing > 0}>
            {photos.length === 1 ? 'Foto auswerten' : `${photos.length} Fotos auswerten`}
          </Button>
        </BottomBar>
      )}
    </Page>
  );
}

/* ----------------------------------------------------------- edit stack */

export function StackEditPage() {
  const { stackId } = useParams();
  const stack = useStack(stackId);
  const saveStack = useData((s) => s.saveStack);
  const deleteStack = useData((s) => s.deleteStack);
  const navigate = useNavigate();
  const [value, setValue] = useState<EditorValue | null>(() => (stack ? fromStack(stack) : null));
  const [invalidIndex, setInvalidIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!stack || !value) {
    return (
      <Page title="Lernstapel" back="/stapel">
        <EmptyState emoji="🤷" title="Stapel nicht gefunden" text="Vielleicht wurde er gelöscht." />
      </Page>
    );
  }

  const save = () => {
    const input = toStackInput(value);
    if ('incomplete' in input) {
      setInvalidIndex(input.incomplete);
      document.querySelector(`[data-index="${input.incomplete}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      haptic([30, 40, 30]);
      return;
    }
    if ('empty' in input) {
      toast('Der Stapel braucht mindestens eine Karte.', { tone: 'error' });
      return;
    }
    saveStack(input, stack.id);
    sound.coin();
    toast('Gespeichert.', { tone: 'success' });
    navigate(`${GAME}?stapel=${stack.id}`, { viewTransition: true });
  };

  return (
    <Page title={stack.title} back="/stapel" className="stack-new">
      <StackEditor
        value={value}
        invalidIndex={invalidIndex}
        onChange={(next) => {
          setInvalidIndex(null);
          setValue(next);
        }}
      />
      <ShareStack stack={stack} />
      <div className="danger-zone">
        <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
          Stapel löschen
        </Button>
      </div>
      <BottomBar>
        <Button size="lg" block icon="check" onClick={save}>
          Speichern
        </Button>
      </BottomBar>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Stapel löschen?"
        message={`«${stack.title}» mit ${cardCount(stack.cards.length)} und dem Lernstand aller Personen wird gelöscht.`}
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          deleteStack(stack.id);
          toast(`«${stack.title}» gelöscht.`);
          navigate('/stapel', { replace: true, viewTransition: true });
        }}
      />
    </Page>
  );
}
