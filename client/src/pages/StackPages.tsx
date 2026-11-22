import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { LearnExtractMode, LearnUsage } from '../../../shared/types.ts';
import { Mascot } from '../components/Brand.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomBar, Page, Section } from '../components/Layout.tsx';
import { PhotoGrid, type Photo } from '../components/PhotoGrid.tsx';
import { ShareStack } from '../components/ShareStack.tsx';
import { StackEditor, toStackInput } from '../components/StackEditor.tsx';
import { Button, ConfirmSheet, EmptyState, IconButton, Segmented } from '../components/ui.tsx';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { haptic } from '../lib/device.ts';
import { parseTextCards } from '../lib/learn.ts';
import { sound } from '../lib/audio.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useStack } from '../store/data.ts';
import { fromDraft, fromStack, useLearnDraft, type EditorValue } from '../store/learnDraft.ts';
import { soloLearnPath } from '../games/spickzettel/modes.ts';
import { obviousLearner } from '../lib/learners.ts';
import { useLearners } from '../store/learners.ts';
import { useGameSettings, useSettings } from '../store/settings.ts';
import { toast, useUi } from '../store/ui.ts';
import { deleteStackWithUndo, withUndo } from '../store/undo.ts';

/** Where stacks are learned – the «Lernen» tab. */
const LEARN = '/lernen';

function cardCount(n: number): string {
  return `${n} ${n === 1 ? 'Karte' : 'Karten'}`;
}

/** «1. Dezember» from 2026-12-01. */
function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('de-CH', { day: 'numeric', month: 'long' });
}

/* ------------------------------------------------------------ new stack */

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
  const learners = useLearners();

  const [step, setStep] = useState<Step>(() => (draft ? 'review' : params.get('text') ? 'text' : 'pick'));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [usage, setUsage] = useState<LearnUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [invalidIndex, setInvalidIndex] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Remembered per device: take over exactly what is on the photos, or invent new cards on the topic.
  const [photoMode, setPhotoMode] = useGameSettings<{ mode: LearnExtractMode; count: number }>('stapel-fotos', { mode: 'exact', count: 20 });
  const creative = photoMode.mode === 'creative';

  useEffect(() => {
    if (!online) return;
    api
      .learnUsage()
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [online]);

  const updateDraft = (value: EditorValue) => setDraft({ ...value, ownerId: userId });

  const analyse = async () => {
    if (photos.length === 0) return;
    setError(null);
    setStep('reading');
    sound.unlock();
    try {
      const result = await api.learnExtract(
        photos.map((p) => p.url),
        photoMode,
      );
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
      fromDraft(
        { title: '', subject: '', languages: [], cards, suggestedModes: ['blitz', 'kasten'], removedPersonalData: false, generated: false },
        'text',
      ),
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
    // Straight into the first round when it is clear who learns; otherwise «Wer lernt?» asks.
    const learner = obviousLearner(learners, stack.id, useSettings.getState().lastLearnerByStack, Object.values(useData.getState().progress));
    navigate(learner ? soloLearnPath(stack.id, 'kasten', learner) : `${LEARN}/${stack.id}`, {
      replace: true,
      viewTransition: true,
    });
  };

  if (step === 'reading') {
    return (
      <Page title="Neuer Stapel" className="stack-new">
        <div className="reading" role="status" aria-live="polite">
          <Mascot size={150} mood="wow" />
          <p className="reading__title">{creative ? 'Phoni erfindet neue Aufgaben …' : 'Phoni liest deine Fotos …'}</p>
          <p className="reading__text">{creative ? 'Das dauert etwa 20 Sekunden.' : 'Das dauert etwa 10 Sekunden.'}</p>
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
      <Page
        title="Karten prüfen"
        back={LEARN}
        className="stack-new"
        actions={<IconButton icon="trash" label="Entwurf verwerfen" onClick={() => setConfirmDiscard(true)} />}
      >
        <p className="notice notice--info stack-review-note">
          {draft.generated
            ? `Phoni hat ${cardCount(draft.cards.length)} zum Thema deiner Fotos neu erfunden und nochmals kontrolliert. Auch eine KI irrt sich – bitte prüfe jede Karte.`
            : draft.source === 'photo'
              ? `Phoni hat ${cardCount(draft.cards.length)} erkannt.`
              : `${cardCount(draft.cards.length)} erkannt.`}{' '}
          {unsure > 0
            ? draft.generated
              ? `${unsure === 1 ? 'Eine Karte ist' : `${unsure} Karten sind`} bei der Kontrolle aufgefallen (gelb) – korrigiere oder lösche sie.`
              : `Bitte prüfe sie kurz – besonders die ${unsure} gelb markierten.`
            : draft.generated
              ? ''
              : 'Bitte prüfe sie kurz.'}
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
          <Button size="lg" block icon="play" onClick={save}>
            Speichern & lernen
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
            const discarded = useLearnDraft.getState().draft;
            setConfirmDiscard(false);
            setDraft(null);
            setStep('pick');
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

  if (step === 'text') {
    return (
      <Page title="Karten abtippen" back={LEARN} className="stack-new">
        <Section title="Eine Karte pro Zeile">
          <div className={`field ${textError ? 'has-error' : ''}`}>
            <textarea
              className="text-import"
              aria-label="Karten, eine pro Zeile"
              aria-invalid={!!textError}
              value={text}
              rows={10}
              placeholder={'le chien = der Hund\nHauptort von Bern? = Bern\nDie Aare fliesst durch [Bern].'}
              onChange={(e) => {
                setText(e.target.value);
                setTextError(null);
              }}
            />
            {textError ? (
              <p className="field__error">{textError}</p>
            ) : (
              <p className="field__hint">
                Trenne Frage und Antwort mit «=», «–» oder einem Tabulator. Für einen Lückentext setzt du das fehlende Wort in
                eckige Klammern: «Die Aare fliesst durch [Bern].»
              </p>
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
    <Page title="Neuer Stapel" subtitle="Fotografiere dein Wörtliblatt oder deine Heftseite." back={LEARN} className="stack-new">
      <Section title="Fotos">
        <PhotoGrid
          photos={photos}
          setPhotos={setPhotos}
          preparing={preparing}
          setPreparing={setPreparing}
          disabled={blocked}
          onError={setError}
        />

        {photos.length > 0 && !blocked && (
          <div className="photo-mode">
            <p className="photo-mode__title" id="photo-mode-title">
              Was soll Phoni daraus machen?
            </p>
            <div className="mode-picker mode-picker--two" role="radiogroup" aria-labelledby="photo-mode-title">
              {(
                [
                  { value: 'exact', emoji: '📋', label: 'Genau übernehmen', hint: 'nur was auf den Fotos steht' },
                  { value: 'creative', emoji: '✨', label: 'Neue Aufgaben erfinden', hint: 'gleiches Thema, neue Karten' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={photoMode.mode === option.value}
                  className={`mode-option ${photoMode.mode === option.value ? 'is-active' : ''}`}
                  onClick={() => {
                    haptic(6);
                    setPhotoMode({ ...photoMode, mode: option.value });
                  }}
                >
                  <span className="mode-option__emoji" aria-hidden="true">
                    {option.emoji}
                  </span>
                  <span className="mode-option__label">{option.label}</span>
                  <span className="mode-option__hint">{option.hint}</span>
                </button>
              ))}
            </div>
            {creative && (
              <>
                <Segmented
                  label="Wie viele neue Karten?"
                  value={String(photoMode.count)}
                  options={[10, 20, 30].map((n) => ({ value: String(n), label: `${n} Karten` }))}
                  onChange={(count) => setPhotoMode({ ...photoMode, count: Number(count) })}
                />
                <p className="settings-panel__hint">
                  Phoni erkennt Fach, Thema und Art der Aufgaben und erfindet neue, ähnliche – zum Üben über das Blatt hinaus.
                  Bitte prüfe die Karten danach.
                </p>
              </>
            )}
          </div>
        )}
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
            {creative ? `${photoMode.count} neue Karten erfinden` : photos.length === 1 ? 'Foto auswerten' : `${photos.length} Fotos auswerten`}
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
  const navigate = useNavigate();
  const [value, setValue] = useState<EditorValue | null>(() => (stack ? fromStack(stack) : null));
  const [invalidIndex, setInvalidIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!stack || !value) {
    return (
      <Page title="Lernstapel" back={LEARN}>
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
    navigate(`${LEARN}/${stack.id}`, { viewTransition: true });
  };

  return (
    <Page
      title={stack.title}
      back={`${LEARN}/${stack.id}`}
      className="stack-new"
      actions={<IconButton icon="trash" label="Stapel löschen" onClick={() => setConfirmDelete(true)} />}
    >
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
          setConfirmDelete(false);
          deleteStackWithUndo(stack);
          navigate(LEARN, { replace: true, viewTransition: true });
        }}
      />
    </Page>
  );
}
