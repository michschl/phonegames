# Spiele entwickeln

Jedes Spiel ist ein eigener Ordner in [`client/src/games/`](../client/src/games/) und wird in
[`registry.ts`](../client/src/games/registry.ts) eingetragen. Aktuell sind es 18 Partyspiele für die Runde
(«Zusammen»); «Lernen» ist ein eigener Bereich (siehe «Bereiche mit eigenen Seiten»), die 5 Spiele von «Allein
spielen» und die 8 der «Arena» haben einen eigenen, einfacheren Aufbau (siehe «Spiele für «Allein» und die Arena»).
Katalog, Suche, «Meine Spiele», Spielgruppen, Einstellungen und der Vollbild-Spielmodus funktionieren danach
automatisch.
Regeln («So geht’s») und Einstellungen erscheinen auf dem Startbildschirm des Spiels zugeklappt; bei den
Einstellungen zeigt ein Etikett, ob sie angepasst wurden.

## Ein neues Spiel in 5 Schritten

### 1. Ordner anlegen

```
client/src/games/mein-spiel/
├── index.tsx           Definition (Name, Farben, Regeln, Einstellungen …)
├── MeinSpielGame.tsx   Das Spiel (Default-Export)
├── Settings.tsx        optional: Einstellungen auf dem Startbildschirm (zugeklappt)
└── mein-spiel.css      optional: Styles
```

### 2. Definition schreiben (`index.tsx`)

```ts
import { lazy } from 'react';
import type { GameDefinition } from '../types.ts';

export interface MeinSpielSettings {
  runden: number;
}

export const meinSpiel: GameDefinition<MeinSpielSettings> = {
  id: 'mein-spiel', // URL-tauglich, wird in den Nutzerdaten gespeichert – nie mehr ändern!
  name: 'Mein Spiel',
  tagline: 'Kurzer, knackiger Untertitel',
  description: 'Ein bis zwei Sätze für die Suche und den Katalog.',
  emoji: '🎯', // Fallback, wenn kein Art-Component vorhanden ist
  colors: ['#8b5cf6', '#2de2e6'], // Verlauf der Spielkarte
  minPlayers: 2,
  maxPlayers: 12,
  duration: '10–20 Min.',
  age: 'ab 8 J.',
  tags: ['Schnell', 'Raten'], // erscheinen als Filter im Katalog
  status: 'available', // 'soon' = im Katalog als «Demnächst»
  scored: 'points', // optional: Punkte pro Person zählen für die Familien-Rangliste ('wins' = nur Siege)
  rules: ['Regel 1 …', 'Regel 2 …'],
  defaultSettings: { runden: 5 },
  // Settings: MeinSpielSettingsPanel,
  Play: lazy(() => import('./MeinSpielGame.tsx')),
};
```

### 3. Das Spiel umsetzen

Die Spielkomponente erhält die Mitspielenden der gewählten Gruppe, die Einstellungen und eine Funktion zum Beenden:

```tsx
import type { GameProps } from '../types.ts';
import type { MeinSpielSettings } from './index.ts';
import { useWakeLock } from '../../lib/device.ts';

export default function MeinSpielGame({ players, settings, onExit }: GameProps<MeinSpielSettings>) {
  useWakeLock(true); // Bildschirm bleibt an
  return (
    <div className="mein-spiel">
      {players.map((p) => p.name).join(', ')} – {settings.runden} Runden
      <button onClick={onExit}>Beenden</button>
    </div>
  );
}
```

Die Komponente wird im Vollbild (ohne Tab-Leiste) dargestellt.

Hat das Spiel eine Wertung (`scored`), meldet es den aktuellen Stand mit
`useReportScores(punkteProSpielerId, siegerIds?)` aus [`shared/results.ts`](../client/src/games/shared/results.ts) –
bei jeder Änderung, nur die letzte Meldung zählt. Beim Verlassen des Spiels (oder bei «Neues Spiel») kommen Punkte,
Sieg und Partie in die Rangliste der Familie, die auf dem Startbildschirm des Spiels steht. Ohne Angabe der Sieger
gewinnt, wer die meisten Punkte hat. Spiele mit `TeamTurnGame` melden ihre Punkte selbst.

### 4. Im Katalog registrieren

In [`client/src/games/registry.ts`](../client/src/games/registry.ts):

```ts
import { meinSpiel } from './mein-spiel/index.tsx';

export const GAMES: GameDefinition[] = [bombe, /* … */, meinSpiel];
```

Mit `status: 'soon'` erscheint ein Spiel als «Demnächst» im Katalog, ist aber noch nicht spielbar.

### 5. Testen

Reine Spiellogik (Zufall, Punkte, Timer-Berechnungen) in eine eigene `logic.ts` auslagern und mit Vitest testen –
siehe [`bombe/logic.test.ts`](../client/src/games/bombe/logic.test.ts) und
[`shared/logic.test.ts`](../client/src/games/shared/logic.test.ts).

```bash
npm test && npm run typecheck
```

Abläufe im Browser (Spiel starten, Zug, Auswertung) gehören in die Browser-Tests unter [`e2e/`](../e2e): Sie laufen
gegen die gebaute App auf einem Handy-Bildschirm, prüfen Barrierefreiheit (axe) und schmale Bildschirme und laufen in
GitHub Actions vor jedem Deploy. Hilfsfunktionen für Konto, Gruppe, Stapel und Spielstart stehen in
[`e2e/helpers.ts`](../e2e/helpers.ts).

```bash
npm run test:e2e                          # alle, baut vorher die App
npx playwright test e2e/spielformen.spec.ts --trace off   # eine Datei, App bereits gebaut
```

## Wiederverwendbare Bausteine

Die meisten Spiele bestehen nur aus Inhalten, ein bisschen Logik und diesen Bausteinen aus
[`client/src/games/shared/`](../client/src/games/shared/):

| Baustein | Datei | Zweck |
| --- | --- | --- |
| `GameShell`, `Stage`, `Headline`, `PromptCard`, `Actions` | `shared/GameShell.tsx` | Vollbild-Rahmen mit Beenden-Dialog, Ton-Schalter, Spielstand-Sheet, Wake Lock und dem Phonegames-Look |
| `PassPrompt`, `SecretReveal`, `PassTurns` | `shared/PassTurns.tsx` | «Gib das Handy an …» und Geheimnisse, die nur sichtbar sind, solange der Finger auf der Karte liegt. `PassTurns` reicht das Handy der Reihe nach an alle weiter |
| `useCountdown`, `TimerRing`, `useStartCountdown`, `CountdownOverlay` | `shared/Timer.tsx` | Zeitlimit mit Ring, Piepsen in den letzten Sekunden, Buzzer am Ende, «3 – 2 – 1»-Start |
| `TeamTurnGame` | `shared/TeamTurnGame.tsx` | Komplette Engine für Teamspiele (Teams, Weitergeben, Zug mit Zeitlimit, Auswertung mit Korrektur, Sieger, Punkte pro Person für die Rangliste) – Pantomime, Verbotene Wörter und Summ-Raten sind damit je ~50 Zeilen |
| `useReportScores` | `shared/results.ts` | Punkte pro Person (und Sieger) für die Familien-Rangliste melden – für Spiele mit `scored` |
| `makeTeams`, `TeamCards`, `ScoreList`, `PlayerPicker`, `fillPerson` | `shared/players.tsx` | Teams einteilen, Ranglisten mit Medaillen, Personen antippen (Abstimmungen; mit `status` farbige Tafeln mit Badges), `{person}` in Karten ersetzen |
| `EstimateForm`, `CountUp` | `shared/estimate.tsx` | Geheime Zahl-Eingabe («4'478», «1,5») und hochzählende Auflösung mit Ticken – Schätzmeister und die Schätzrunde in «Lernen» |
| `drawFresh` | `shared/deck.ts` | Zufällige Karte ziehen, ohne kürzlich gezeigte Karten zu wiederholen (merkt sich das pro Gerät) |
| `OptionRow`, `ChipSelect`, `SettingsPanel` | `shared/settings.tsx` | Bausteine für die Einstellungen auf dem Startbildschirm |
| `PackSettingsPanel`, `filterPacks` | `shared/packs.tsx` | Kartenpakete «Familie / Freunde / Party» |
| `StarterRoulette` | `components/StarterRoulette.tsx` | Animierte Auslosung, wer beginnt |
| `sound` | `lib/audio.ts` | Synthetisierte Sounds: `tap()`, `pop()`, `flip()`, `pluck(i)`, `whoosh()`, `swirl()`, `click()`, `ding()`, `coin()`, `countTick()`, `correct()`, `wrong()`, `buzzer()`, `beep()`, `sparkle()`, `reveal()`, `fanfare()`, `fail()`, `sting()`, `gong()`, `tension()`, `birds()`, `howl()`; Schleifen `drumroll()`, `heartbeat()`, `crickets()` |
| `speak()` | `lib/speech.ts` | Deutsche Sprachausgabe mit automatisch gewählter bester Stimme (z. B. Erzählstimme bei «Nachts im Dorf»); `primeSpeech()` im ersten Klick aufrufen |
| `useTilt()`, `requestTiltPermission()` | `lib/motion.ts` | Kipp-Gesten über den Bewegungssensor (z. B. «Wer bin ich?») |
| `confetti()`, `haptic()`, `useWakeLock()` | `lib/confetti.ts`, `lib/device.ts` | Konfetti, Vibration, Bildschirm wach halten |

### Spiele ohne Spielgruppe

Werkzeuge wie «Zufallsfinger» oder «Flaschendrehen» brauchen keine Namen. Mit `noGroup: true` in der
Definition entfällt die Gruppenauswahl auf dem Startbildschirm, und `players` ist leer.

### Bereiche mit eigenen Seiten

Die Spiele starten über den gemeinsamen Startbildschirm (`/spiel/<id>`). «Lernen» ist kein Spiel im Katalog,
sondern ein eigener Bereich (Tab `/lernen`) mit Stapeln, Stapelseite und dem Schritt «Wer spielt mit?». Seine
Definition steht in `registry.ts` unter `SECTIONS` statt in `GAMES`: `getGame()` findet sie, damit die Spielformen
zum Zusammenspielen den Spielbildschirm (`/spiel/spickzettel/los`) nutzen können; «Spiele», «Entdecken», «Meine
Spiele» und «Weiterspielen» zeigen nur `GAMES` (`getCatalogGame()`) – «Entdecken» dazu die Spiele von «Allein» und der
Arena, nie aber «Lernen». Dazu gibt es in der Definition:

| Feld | Wirkung |
| --- | --- |
| `pathFor(settings)` | Wo das Spiel mit diesen Einstellungen zu Hause ist – nach dem Spiel und wenn `/spiel/<id>` trotzdem aufgerufen wird (Lernen: «Wer spielt mit?» der letzten Spielform zum Zusammenspielen, sonst der Tab) |
| `playersNeeded(settings)` | Mindestzahl Personen je nach Einstellung (sonst `minPlayers`), z. B. 2 für das Duell, 4 für die Blitzrunde |

### Ein Teamspiel in wenigen Zeilen

```tsx
export default function MeinTeamspiel({ players, settings, onExit }: GameProps<TurnSettings>) {
  return (
    <TeamTurnGame
      players={players}
      onExit={onExit}
      accent="#8b5cf6"
      verb="erklärt"
      turnSeconds={settings.seconds}
      targetScore={settings.target}
      draw={(used) => drawFresh('mein-teamspiel', KARTEN, (k) => k.id, { exclude: used })}
      cardLabel={(k) => k.text}
      renderCard={(k) => <PromptCard>{k.text}</PromptCard>}
      rulesHint="Erkläre den Begriff, ohne ihn zu nennen."
    />
  );
}
```

### Wichtig für Sound und Sensoren auf dem Handy

Browser erlauben Audio erst nach einer Berührung. Die Sound-Engine kümmert sich selbst darum: Sie startet bzw.
weckt den Audio-Kontext bei jeder Berührung. Für die **Sprachausgabe** auf iOS muss die erste Ansage aus einem
Klick heraus kommen – dafür `primeSpeech()` direkt im Klick-Handler aufrufen. Dasselbe gilt für den
Bewegungssensor (`requestTiltPermission()`).

Jedes Spiel sollte an seinen wichtigen Momenten klingen: Start, neue Karte, Auswahl, Punkte, richtig/falsch,
Spannung vor einer Auflösung (Trommelwirbel, Herzschlag, `tension()`) und eine Belohnung danach (`ding()`,
`sparkle()`, `fanfare()` bzw. `fail()`/`sting()`). Schleifen beim Phasenwechsel und beim Verlassen stoppen.

## Spiele für «Allein» und die Arena

Diese Spiele brauchen keine Spielgruppe: Eine Person spielt eine Runde und bekommt Punkte, Sterne und einen Rekord. Start-, Spiel- und Ergebnisseite, die Wahl der Person, Münzen (Preis einer Runde, Autos,
Skins), Rekorde, die Familien-Rangliste und der Eintrag in «Entdecken» kommen von den Seiten
([`pages/SoloPages.tsx`](../client/src/pages/SoloPages.tsx), [`pages/ArenaPages.tsx`](../client/src/pages/ArenaPages.tsx)) –
das Spiel selbst ist nur eine Komponente, die eine Runde spielt.

### «Allein spielen» (6–12 Jahre)

1. Ordner `client/src/solo/mein-spiel/` mit der Spielkomponente (Default-Export). Sie bekommt `SoloPlayProps`
   ([`solo/types.ts`](../client/src/solo/types.ts)): `level` (1 = 6–9, 2 = 8–12 Jahre), `player`, im Phoni-Rennen
   `car`, und meldet sich mit `onFinish({ score, stars, summary })` (0–3 Sterne, «14 Züge in 38 Sekunden») oder
   `onQuit()`. Den Rahmen gibt `GameShell` (`<GameShell label="Mein Spiel" onExit={onQuit} accent="#8b5cf6">`).
2. In [`solo/registry.ts`](../client/src/solo/registry.ts) in `SOLO_GAMES` eintragen: `id`, `name`, `tagline`,
   `description`, `emoji`, `colors`, `skills` (was es übt – erscheint auch in der Suche), `rules` pro Altersstufe
   (`{ 1: [...], 2: [...] }`), `duration` und `Play: lazy(() => import('./mein-spiel/MeinSpiel.tsx'))`.
3. Regeln, Punkte und Aufgaben-Erzeugung in [`solo/logic.ts`](../client/src/solo/logic.ts) und dort testen.
4. Bild `client/public/covers/solo-<id>.webp` (360 × 220 px) – fehlt es, steht die Kachel mit dem Emoji trotzdem.

### Arena (3D, ab 13)

1. Ordner `client/src/arena/mein-spiel/` mit der Spielkomponente. Sie bekommt `ArenaPlayProps`
   ([`arena/types.ts`](../client/src/arena/types.ts)): `player`, `skin`, `option` (gewählte Piste, Stil, Strecke …
   bzw. das Level), `tilt` (Neigen statt Finger), `mode` (z. B. «Einfach»/«Profi»), und meldet sich mit
   `onFinish({ score, stars, summary, key?, records? })` oder `onQuit()`.
2. Die Szene zeichnet `useArenaScene(canvasRef, (renderer, info) => ({ scene, camera, update(dt), fx }))` aus
   [`arena/engine.ts`](../client/src/arena/engine.ts) – Grösse, Auflösung, Effekte (Bloom, Vignette, FXAA, Einstellung
   «Grafik») und das Aufräumen übernimmt die Engine. Himmel, Wasser, Partikel, Leuchtspuren, Konfetti und Wackeln
   gibt es fertig in [`arena/fx.ts`](../client/src/arena/fx.ts), Steuerung mit Finger, Tasten oder Neigen in
   [`arena/input.ts`](../client/src/arena/input.ts) (`useSteer`, `useTwinSticks`).
3. In [`arena/registry.ts`](../client/src/arena/registry.ts) in `ARENA_GAMES` eintragen – wie bei «Allein», dazu
   `rules` (eine Liste), `tilt`, `skins` (der erste gratis, die anderen kosten Münzen, solange «Belohnungen» an ist),
   `skinLabel`, `unit` (Einheit in der Rangliste) und je nach Spiel `options` (Auswahl vor der Runde, Rangliste pro
   Auswahl), `levels` (Level nacheinander, die Rangliste zählt die geschafften) oder `modes` (Spielweise ohne
   Einfluss auf die Rangliste).
4. Regeln ohne three.js in einer eigenen Datei (`arena/mein-spiel.ts`) und testen – in Vitest gibt es kein WebGL.
   Erzeugte Level prüft ein Test auf Lösbarkeit (wie `solvable` in der Kugelbahn oder `solve` in Orbit).
5. Bild `client/public/covers/arena-<id>.webp` (360 × 420 px), aufgenommen im Grafikmodus «Schön».

## Inhalte ergänzen

Alle Inhalte liegen als TypeScript-Dateien neben dem jeweiligen Spiel und lassen sich ohne Programmierkenntnisse
erweitern – einfach einen Eintrag nach dem Muster der vorhandenen ergänzen. IDs müssen eindeutig bleiben.

| Spiel | Datei |
| --- | --- |
| Bombe | `bombe/questions.ts` |
| Spion unter uns | `spion/locations.ts` |
| Doppelgänger | `doppelgaenger/pairs.ts` |
| Wer bin ich? | `wer-bin-ich/decks.ts` |
| Pantomime | `pantomime/terms.ts` |
| Verbotene Wörter | `verbotene-woerter/cards.ts` |
| Zeichnen & Raten | `zeichnen/terms.ts` |
| Summ-Raten | `summ-raten/songs.ts` |
| Schätzmeister | `schaetzmeister/questions.ts` (nur gut belegte Zahlen!) |
| Mehr oder weniger | `mehr-oder-weniger/facts.ts` (nur gut belegte Zahlen!) |
| Wer würde eher …? | `wer-wuerde-eher/questions.ts` |
| Wahrheit oder Pflicht | `wahrheit-oder-pflicht/cards.ts` (`{person}` = zufällige andere Person) |
| Ich hab noch nie … | `ich-hab-noch-nie/statements.ts` |

## Fragen für «Bombe» ergänzen

Die Fragen stehen in [`client/src/games/bombe/questions.ts`](../client/src/games/bombe/questions.ts), gruppiert nach
Kategorie. Einfach eine Zeile in der passenden Liste ergänzen:

```ts
reisen: [
  'Was nimmt man in die Ferien mit?',
  'Nenne etwas, das man im Nachtzug findet.', // neu
  …
],
```

Regeln für gute Fragen:

- Es muss **viele** mögliche Antworten geben (mindestens so viele, wie Leute mitspielen).
- Kurz formulieren – die Frage muss in einer Sekunde gelesen sein.
- Schweizer Rechtschreibung: «ss» statt «ß» (ein Test prüft das).

Eine neue Kategorie wird in `CATEGORIES` ergänzt und erscheint automatisch in den Einstellungen.
Die Kategorie «Buchstaben-Mix» erzeugt zusätzlich Kombinationen wie «Nenne ein Tier mit «K»» aus `LETTER_THEMES`.
