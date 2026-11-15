# Spiele entwickeln

Jedes Spiel ist ein eigener Ordner in [`client/src/games/`](../client/src/games/) und wird in
[`registry.ts`](../client/src/games/registry.ts) eingetragen. Katalog, Suche, «Meine Spiele», Spielgruppen,
Einstellungen und der Vollbild-Spielmodus funktionieren danach automatisch.

## Ein neues Spiel in 5 Schritten

### 1. Ordner anlegen

```
client/src/games/mein-spiel/
├── index.ts            Definition (Name, Farben, Regeln …)
├── MeinSpielGame.tsx   Das Spiel (Default-Export)
├── Settings.tsx        optional: Einstellungen auf dem Startbildschirm
└── mein-spiel.css      optional: Styles
```

### 2. Definition schreiben (`index.ts`)

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
import { meinSpiel } from './mein-spiel/index.ts';

export const GAMES: GameDefinition[] = [bombe, meinSpiel, ...comingSoon];
```

Steht das Spiel bereits als «Demnächst» in `comingSoon`, den Eintrag dort entfernen und **dieselbe `id`**
weiterverwenden.

### 5. Testen

Reine Spiellogik (Zufall, Punkte, Timer-Berechnungen) in eine eigene Datei auslagern und mit Vitest testen –
siehe [`bombe/logic.test.ts`](../client/src/games/bombe/logic.test.ts).

```bash
npm test && npm run typecheck
```

## Wiederverwendbare Bausteine

| Baustein | Datei | Zweck |
| --- | --- | --- |
| `StarterRoulette` | `components/StarterRoulette.tsx` | Animierte Auslosung eines Startspielers (mit Sound, Konfetti, «Tippen zum Überspringen») |
| `sound` | `lib/audio.ts` | Web-Audio-Engine: `unlock()`, `tone()`, `noiseBurst()`, `blip()`, `pop()`, `reveal()` |
| `confetti()` | `lib/confetti.ts` | Konfetti-Explosion an einer Bildschirmposition |
| `haptic()` | `lib/device.ts` | Vibration (respektiert die Einstellung des Nutzers) |
| `useWakeLock()` | `lib/device.ts` | Bildschirm wach halten |
| `Button`, `Sheet`, `ConfirmSheet`, `Segmented`, `Toggle`, `Avatar` | `components/ui.tsx` | UI-Komponenten im Plausch-Design |
| `useGameSettings()` | `store/settings.ts` | Spieleinstellungen pro Gerät speichern |

### Wichtig für Sound auf dem Handy

Browser erlauben Audio erst nach einer Berührung. `sound.unlock()` deshalb immer **direkt im Klick-Handler**
aufrufen (z. B. im Start-Button) – der «Spiel starten»-Button auf dem Startbildschirm macht das bereits.

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
