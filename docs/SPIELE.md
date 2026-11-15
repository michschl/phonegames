# Spiele entwickeln

Jedes Spiel ist ein eigener Ordner in [`client/src/games/`](../client/src/games/) und wird in
[`registry.ts`](../client/src/games/registry.ts) eingetragen. Aktuell sind es 17 Spiele. Katalog, Suche, «Meine Spiele», Spielgruppen,
Einstellungen und der Vollbild-Spielmodus funktionieren danach automatisch.

## Ein neues Spiel in 5 Schritten

### 1. Ordner anlegen

```
client/src/games/mein-spiel/
├── index.tsx           Definition (Name, Farben, Regeln, Einstellungen …)
├── MeinSpielGame.tsx   Das Spiel (Default-Export)
├── Settings.tsx        optional: Einstellungen auf dem Startbildschirm
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

## Wiederverwendbare Bausteine

Die meisten Spiele bestehen nur aus Inhalten, ein bisschen Logik und diesen Bausteinen aus
[`client/src/games/shared/`](../client/src/games/shared/):

| Baustein | Datei | Zweck |
| --- | --- | --- |
| `GameShell`, `Stage`, `Headline`, `PromptCard`, `Actions` | `shared/GameShell.tsx` | Vollbild-Rahmen mit Beenden-Dialog, Ton-Schalter, Spielstand-Sheet, Wake Lock und dem Phonegames-Look |
| `PassPrompt`, `SecretReveal`, `PassTurns` | `shared/PassTurns.tsx` | «Gib das Handy an …» und Geheimnisse, die nur sichtbar sind, solange der Finger auf der Karte liegt. `PassTurns` reicht das Handy der Reihe nach an alle weiter |
| `useCountdown`, `TimerRing`, `useStartCountdown`, `CountdownOverlay` | `shared/Timer.tsx` | Zeitlimit mit Ring, Piepsen in den letzten Sekunden, Buzzer am Ende, «3 – 2 – 1»-Start |
| `TeamTurnGame` | `shared/TeamTurnGame.tsx` | Komplette Engine für Teamspiele (Teams, Weitergeben, Zug mit Zeitlimit, Auswertung mit Korrektur, Sieger) – Pantomime, Verbotene Wörter und Summ-Raten sind damit je ~50 Zeilen |
| `makeTeams`, `TeamCards`, `ScoreList`, `PlayerPicker`, `fillPerson` | `shared/players.tsx` | Teams einteilen, Ranglisten mit Medaillen, Personen antippen (Abstimmungen), `{person}` in Karten ersetzen |
| `drawFresh` | `shared/deck.ts` | Zufällige Karte ziehen, ohne kürzlich gezeigte Karten zu wiederholen (merkt sich das pro Gerät) |
| `OptionRow`, `ChipSelect`, `SettingsPanel` | `shared/settings.tsx` | Bausteine für die Einstellungen auf dem Startbildschirm |
| `PackSettingsPanel`, `filterPacks` | `shared/packs.tsx` | Kartenpakete «Familie / Freunde / Party» |
| `StarterRoulette` | `components/StarterRoulette.tsx` | Animierte Auslosung, wer beginnt |
| `sound` | `lib/audio.ts` | Synthetisierte Sounds: `tap()`, `flip()`, `pluck(i)`, `whoosh()`, `swirl()`, `click()`, `ding()`, `coin()`, `correct()`, `wrong()`, `buzzer()`, `beep()`, `sparkle()`, `reveal()`, `fanfare()`, `fail()`, `sting()`, `gong()`, `tension()`, `birds()`, `howl()`; Schleifen `drumroll()`, `heartbeat()`, `crickets()` |
| `speak()` | `lib/speech.ts` | Deutsche Sprachausgabe mit automatisch gewählter bester Stimme (z. B. Erzählstimme bei «Nachts im Dorf»); `primeSpeech()` im ersten Klick aufrufen |
| `useTilt()`, `requestTiltPermission()` | `lib/motion.ts` | Kipp-Gesten über den Bewegungssensor (z. B. «Wer bin ich?») |
| `confetti()`, `haptic()`, `useWakeLock()` | `lib/confetti.ts`, `lib/device.ts` | Konfetti, Vibration, Bildschirm wach halten |

### Spiele ohne Spielgruppe

Werkzeuge wie «Zufallsfinger» oder «Flaschendrehen» brauchen keine Namen. Mit `noGroup: true` in der
Definition entfällt die Gruppenauswahl auf dem Startbildschirm, und `players` ist leer.

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
