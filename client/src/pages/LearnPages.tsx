import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { LIMITS, type LearnMode, type LearnStack, type Player } from '../../../shared/types.ts';
import { Mascot } from '../components/Brand.tsx';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { DueRows } from '../components/LearnDue.tsx';
import { LearnerPicker } from '../components/LearnerPicker.tsx';
import { BottomBar, Page, Section } from '../components/Layout.tsx';
import { ActionSheet, Button, EmptyState, IconButton, Segmented } from '../components/ui.tsx';
import { BoxRow } from '../games/spickzettel/BoxRow.tsx';
import { spickzettel, type SpickzettelSettings } from '../games/spickzettel/index.tsx';
import { isSoloMode, MODES, SITUATIONS, soloLearnPath } from '../games/spickzettel/modes.ts';
import '../games/spickzettel/spickzettel.css';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { boxCounts, canPlayChoice, dueCards, dueDayLabel, kastenStatus, modeFits, recommendStacks, subjectEmoji } from '../lib/learn.ts';
import { learnerColor, learnerId, sameName } from '../lib/learners.ts';
import { normalize } from '../lib/util.ts';
import { useData, useDueByStack, useGroup, useProgress, useStack, useStacks } from '../store/data.ts';
import { useDefaultLearner, useDueList, useLearners } from '../store/learners.ts';
import { useGameSettings, useSettings } from '../store/settings.ts';
import { deleteStackWithUndo } from '../store/undo.ts';
import { GroupSection, PlayLoading, usePlayScreen, useSelectedGroup } from './GamePages.tsx';

const SoloLearn = lazy(() => import('../games/spickzettel/SoloLearn.tsx'));

/** The page of a stack: who learns, the Kartenkasten and the other ways to play it. */
export function stackHome(stackId: string | undefined): string {
  return stackId ? `/lernen/${stackId}` : '/lernen';
}

function cardCount(n: number): string {
  return `${n} ${n === 1 ? 'Karte' : 'Karten'}`;
}

/* ------------------------------------------------------------------ hub */

/** First visit: what Spickzettel does, in three steps – and the way to the first stack. */
function LearnIntro() {
  return (
    <div className="learn-intro">
      <Mascot size={120} mood="happy" />
      <h2 className="learn-intro__title">Schulstoff spielend repetieren</h2>
      <ol className="learn-intro__steps">
        <li>
          <strong>Fotografieren</strong> – Wörtliblatt, Heftseite oder Lückentext. Oder abtippen.
        </li>
        <li>
          <strong>Kurz prüfen</strong> – Phoni macht Lernkarten daraus, du schaust drüber.
        </li>
        <li>
          <strong>Jeden Tag ein paar Minuten</strong> – der Kartenkasten weiss, was dran ist.
        </li>
      </ol>
      <div className="learn-intro__actions">
        <Link to="/stapel/neu" className="btn btn--primary btn--lg btn--block" viewTransition>
          <Icon name="camera" size={20} />
          <span>Foto aufnehmen</span>
        </Link>
        <Link to="/stapel/neu?text=1" className="btn btn--secondary btn--lg btn--block" viewTransition>
          <Icon name="text" size={20} />
          <span>Karten abtippen</span>
        </Link>
      </div>
    </div>
  );
}

/** From this many stacks the list gets a search field. */
const SEARCH_FROM = 7;

/** «Lernen» tab: who has cards due today, and all stacks. */
export function LearnHubPage() {
  const all = useStacks();
  const due = useDueList();
  const dueByStack = useDueByStack();
  const progress = useData((s) => s.progress);
  const navigate = useNavigate();
  const [menu, setMenu] = useState<LearnStack | null>(null);
  const [query, setQuery] = useState('');
  // Due first, then what was learned or edited last – and a search field for long lists.
  const ranked = useMemo(() => recommendStacks(all, progress, dueByStack, null, all.length), [all, progress, dueByStack]);
  const q = normalize(query);
  const stacks = q ? ranked.filter((stack) => normalize(`${stack.title} ${stack.subject}`).includes(q)) : ranked;
  // When is something due again – for a calm «Alles erledigt» instead of an empty list.
  const next = useMemo(() => {
    const now = Date.now();
    let soonest = Infinity;
    for (const entry of Object.values(progress)) {
      if (entry.deleted) continue;
      for (const card of Object.values(entry.cards)) if (card.due > now) soonest = Math.min(soonest, card.due);
    }
    return Number.isFinite(soonest) ? soonest : null;
  }, [progress]);
  const learned = Object.values(progress).some((entry) => !entry.deleted && Object.keys(entry.cards).length > 0);

  return (
    <Page
      title="Lernen"
      subtitle={all.length > 0 ? 'Schulstoff als Karten – allein oder zusammen.' : undefined}
      actions={
        all.length > 0 && (
          <Link to="/stapel/neu" className="icon-btn icon-btn--accent" aria-label="Neuer Stapel" viewTransition>
            <Icon name="plus" />
          </Link>
        )
      }
    >
      {all.length === 0 ? (
        <LearnIntro />
      ) : (
        <>
          <Section title="Heute dran">
            {due.length > 0 ? (
              <DueRows entries={due} />
            ) : (
              <p className="learn-hub__calm">
                {learned
                  ? `Alles erledigt 🎉${next ? ` Die nächsten Karten sind ${dueDayLabel(next)} dran.` : ''}`
                  : 'Tippe einen Stapel an und wähle, wer lernt.'}
              </p>
            )}
          </Section>
          <Section title="Stapel">
            {all.length >= SEARCH_FROM && (
              <input
                className="stack-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Stapel oder Fach suchen"
                aria-label="Stapel oder Fach suchen"
                enterKeyHint="search"
              />
            )}
            {stacks.length === 0 && <p className="settings-panel__hint">Kein Stapel gefunden.</p>}
            <div className="group-list">
              {stacks.map((stack, i) => (
                <div key={stack.id} className="list-row" style={{ animationDelay: `${i * 60}ms` }}>
                  <Link to={`/lernen/${stack.id}`} className="group-card" viewTransition>
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
                  </Link>
                  <IconButton icon="more" label={`Aktionen für «${stack.title}»`} className="list-row__more" onClick={() => setMenu(stack)} />
                </div>
              ))}
            </div>
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
                { label: 'Lernen', icon: 'play', onClick: () => navigate(`/lernen/${menu.id}`, { viewTransition: true }) },
                { label: 'Karten bearbeiten', icon: 'edit', onClick: () => navigate(`/stapel/${menu.id}`, { viewTransition: true }) },
                { label: 'Stapel löschen', icon: 'trash', danger: true, onClick: () => deleteStackWithUndo(menu) },
              ]
            : []
        }
      />
    </Page>
  );
}

/* ----------------------------------------------------------- stack page */

const CHECK_OPTIONS = [
  { value: 'self', label: 'Aufdecken' },
  { value: 'choice', label: 'Auswahl' },
  { value: 'type', label: 'Tippen' },
] as const;

const CHECK_HINT = {
  self: 'Antwort im Kopf sagen, aufdecken, ehrlich bewerten.',
  choice: 'Vier Antworten zur Auswahl – die App prüft.',
  type: 'Antwort eintippen – kleine Tippfehler zählen als «fast richtig».',
} as const;

/** /lernen/:stackId – who learns, their Kartenkasten, and every other way to play the stack. */
export function StackLearnPage() {
  const { stackId } = useParams();
  const stack = useStack(stackId);
  const learners = useLearners(stackId);
  const learner = useDefaultLearner(stackId, learners);
  const setLastLearner = useSettings((s) => s.setLastLearner);
  const checks = useSettings((s) => s.learnCheck);
  const setLearnCheck = useSettings((s) => s.setLearnCheck);
  const [settings, setSettings] = useGameSettings<SpickzettelSettings>(spickzettel.id, spickzettel.defaultSettings!);
  const progress = useProgress(stackId, learner);

  if (!stack) {
    return (
      <Page title="Lernstapel" back="/lernen">
        <EmptyState emoji="🤷" title="Stapel nicht gefunden" text="Vielleicht wurde er gelöscht." />
      </Page>
    );
  }

  const status = kastenStatus(stack, progress);
  const round = dueCards(stack, progress, settings.sessionSize).length;
  const choiceOk = canPlayChoice(stack);
  const stored = learner ? checks[normalize(learner)] : undefined;
  const check = stored === 'choice' && !choiceOk ? 'self' : (stored ?? settings.check);
  const cloze = modeFits('luecke', stack);
  const together = SITUATIONS.filter((s) => s.value !== 'allein')
    .map((situation) => ({ situation, modes: MODES.filter((m) => m.situation === situation.value && modeFits(m.value, stack)) }))
    .filter((group) => group.modes.length > 0);
  const lueckentext = MODES.find((m) => m.value === 'luecke')!;

  return (
    <Page
      title={stack.title}
      subtitle={`${subjectEmoji(stack.subject)} ${cardCount(stack.cards.length)}${stack.subject ? ` · ${stack.subject}` : ''}`}
      back="/lernen"
      className="stack-learn"
      actions={
        <Link to={`/stapel/${stack.id}`} className="icon-btn" aria-label="Karten bearbeiten" viewTransition>
          <Icon name="edit" />
        </Link>
      }
    >
      <Section title="Wer lernt?">
        <LearnerPicker stackId={stack.id} learners={learners} selected={learner} onSelect={(name) => setLastLearner(stack.id, name)} />
      </Section>

      {learner && (
        <section className="learn-panel" aria-labelledby="kasten-title">
          <h2 className="learn-panel__title" id="kasten-title">
            <span aria-hidden="true">🗂️</span> Kartenkasten
          </h2>
          <BoxRow counts={boxCounts(stack, progress)} />
          <p className="learn-panel__status" role="status">
            {status.due > 0
              ? `Heute fällig: ${cardCount(status.due)}${status.fresh > 0 ? `, dazu ${status.fresh} neue` : ''}`
              : status.fresh > 0
                ? `${status.fresh} ${status.fresh === 1 ? 'neue Karte' : 'neue Karten'}`
                : status.state === 'mastered'
                  ? `Alle Karten in Fach 5 ★ – wieder dran ${status.nextDue ? dueDayLabel(status.nextDue) : 'bald'}.`
                  : `Alles erledigt 🎉 – wieder dran ${status.nextDue ? dueDayLabel(status.nextDue) : 'bald'}.`}
          </p>
          <Segmented
            label="Antworten"
            value={check}
            options={CHECK_OPTIONS.filter((o) => o.value !== 'choice' || choiceOk).map((o) => ({ ...o }))}
            onChange={(value) => {
              haptic(6);
              setLearnCheck(learner, value);
            }}
          />
          <p className="settings-panel__hint">{CHECK_HINT[check]}</p>
        </section>
      )}

      {(cloze || together.length > 0) && (
        <Section title="Weitere Spielformen">
          <div className="mode-rows">
            {cloze && learner && (
              <ModeRow to={soloLearnPath(stack.id, 'luecke', learner)} emoji={lueckentext.emoji} label={lueckentext.label} meta="allein" text={lueckentext.text} />
            )}
            {together.map(({ situation, modes }) =>
              modes.map((mode) => (
                <ModeRow
                  key={mode.value}
                  to={`/lernen/${stack.id}/${mode.value}`}
                  emoji={mode.emoji}
                  label={mode.label}
                  meta={situation.label.toLowerCase()}
                  text={mode.text}
                />
              )),
            )}
          </div>
        </Section>
      )}

      <Fold title="Weitere Einstellungen" icon="settings">
        <div className="settings-panel">
          <Segmented
            label="Karten pro Runde"
            value={String(settings.sessionSize)}
            options={[10, 20, 30].map((n) => ({ value: String(n), label: `${n} Karten` }))}
            onChange={(value) => setSettings({ ...settings, sessionSize: Number(value) })}
          />
          {cloze && (
            <Segmented
              label="Lückentext"
              value={settings.clozeInput}
              options={[
                { value: 'bank', label: 'Wortbank' },
                { value: 'type', label: 'Eintippen' },
              ]}
              onChange={(clozeInput) => setSettings({ ...settings, clozeInput })}
            />
          )}
        </div>
      </Fold>

      <BottomBar>
        {learner ? (
          <Link to={soloLearnPath(stack.id, 'kasten', learner)} className="btn btn--primary btn--lg btn--block" viewTransition>
            <Icon name="play" size={20} />
            <span>
              {round > 0 ? `${cardCount(round)} lernen` : 'Trotzdem üben'} · {learner}
            </span>
          </Link>
        ) : (
          <Button size="lg" block disabled>
            Wer lernt? Name eingeben
          </Button>
        )}
      </BottomBar>
    </Page>
  );
}

function ModeRow({ to, emoji, label, meta, text }: { to: string; emoji: string; label: string; meta: string; text: string }) {
  return (
    <Link to={to} className="mode-row" viewTransition>
      <span className="mode-row__emoji" aria-hidden="true">
        {emoji}
      </span>
      <span className="mode-row__body">
        <span className="mode-row__label">
          {label} <small>{meta}</small>
        </span>
        <span className="mode-row__text">{text}</span>
      </span>
      <Icon name="next" />
    </Link>
  );
}

/* ---------------------------------------------------------- play alone */

/**
 * /lernen/:stackId/:mode?person=Lina – one person learns a stack right away: the Kartenkasten
 * starts with the first due card, the Lückentext with the first page. No group, no setup screen.
 */
export function LearnPlayPage() {
  const { stackId, mode } = useParams();
  const stack = useStack(stackId);
  if (stack && GROUP_MODES.includes(mode as LearnMode)) return <TogetherPage key={`${stack.id}-${mode}`} stack={stack} mode={mode as LearnMode} />;
  return <SoloPlay />;
}

/** Modes played together with a group – «Wer spielt mit?» first. */
const GROUP_MODES: LearnMode[] = ['duell', 'blitz', 'schaetzen'];

function SoloPlay() {
  const { stackId, mode } = useParams();
  const [params] = useSearchParams();
  const person = (params.get('person') ?? '').trim().slice(0, LIMITS.nameMax);
  const stack = useStack(stackId);
  const learners = useLearners(stackId);
  const setLastLearner = useSettings((s) => s.setLastLearner);
  const navigate = useNavigate();
  const location = useLocation();
  // Frozen for the round: the list of learners changes as soon as the first answer is recorded.
  const [learner] = useState<Player | null>(
    () => learners.find((p) => sameName(p.name, person)) ?? (person ? { id: learnerId(person), name: person, color: learnerColor(person) } : null),
  );
  usePlayScreen();

  useEffect(() => {
    if (stack && learner) setLastLearner(stack.id, learner.name);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fallback = stackHome(stack?.id);
  if (!stack || !learner || !isSoloMode(mode) || !modeFits(mode, stack)) return <Navigate to={fallback} replace />;

  // Back to where the round was started from (start page, stack page, …).
  const exit = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(fallback, { replace: true });
  };

  return (
    <div className="play-screen">
      <Suspense fallback={<PlayLoading />}>
        <SoloLearn stack={stack} mode={mode} learner={learner} onExit={exit} />
      </Suspense>
    </div>
  );
}

/**
 * /lernen/:stackId/duell (blitz, schaetzen) – playing a stack together: stack and mode are already
 * chosen on the stack page, here only who plays and the settings of the mode.
 */
function TogetherPage({ stack, mode }: { stack: LearnStack; mode: LearnMode }) {
  const navigate = useNavigate();
  const [stored, setSettings] = useGameSettings<SpickzettelSettings>(spickzettel.id, spickzettel.defaultSettings!);
  const settings = { ...stored, stackId: stack.id, mode };
  const { selectedId, select } = useSelectedGroup(spickzettel.id);
  const group = useGroup(selectedId);
  const setLastGroup = useSettings((s) => s.setLastGroup);
  const setLastPlayed = useSettings((s) => s.setLastPlayed);
  const info = MODES.find((m) => m.value === mode)!;
  const situation = SITUATIONS.find((s) => s.value === info.situation)!;
  const fits = modeFits(mode, stack);
  const count = group?.players.length ?? 0;
  const missing = Math.max(0, spickzettel.playersNeeded!(settings) - count);
  const canStart = fits && !!group && missing === 0;
  const Settings = spickzettel.Settings!;

  const start = () => {
    if (!canStart || !group) return;
    sound.unlock(); // must happen inside the tap for iOS
    haptic(20);
    setSettings(settings);
    setLastGroup(spickzettel.id, group.id);
    setLastPlayed(spickzettel.id, group.id);
    navigate(`/spiel/${spickzettel.id}/los`, { viewTransition: true });
  };

  return (
    <Page title={`${info.emoji} ${info.label}`} subtitle={`«${stack.title}» · ${situation.label.toLowerCase()}`} back={`/lernen/${stack.id}`} className="setup">
      <p className="together__text">{info.text}</p>
      {!fits && <p className="notice notice--info">Dieser Stapel hat zu wenige passende Karten für {info.label === 'Duell' ? 'ein Duell' : `die ${info.label}`}.</p>}
      <GroupSection title="Wer spielt mit?" selectedId={selectedId} onSelect={select} />
      <Fold title="Einstellungen" icon="settings" className="fold--settings">
        <Settings value={settings} onChange={setSettings} />
      </Fold>
      <BottomBar>
        <Button size="lg" block icon="play" onClick={start} disabled={!canStart}>
          {!fits
            ? 'Zu wenige Karten'
            : missing > 0
                ? `Noch ${missing} ${missing === 1 ? 'Person' : 'Personen'} hinzufügen`
                : `${info.label} starten · ${count} ${count === 1 ? 'Person' : 'Personen'}`}
        </Button>
      </BottomBar>
    </Page>
  );
}
