import { lazy } from 'react';
import type { SoloGame } from './types.ts';

/*
 * «Allein spielen»: games for one person, for 6 to 12 years. Each trains a skill – reacting, steering,
 * remembering, recognising patterns, sorting – in short rounds. With «Belohnungen» on, a round costs
 * coins that are earned by learning.
 */
export const SOLO_GAMES: SoloGame[] = [
  {
    id: 'rennen',
    name: 'Phoni-Rennen',
    tagline: 'Ausweichen, Sterne sammeln, Vollgas',
    description: 'Steuere dein Auto über die Strasse: Weiche Pylonen, Ölflecken und anderen Autos aus und sammle Sterne. Je weiter, desto schneller.',
    emoji: '🏎️',
    colors: ['#ff4f6d', '#ffb13d'],
    skills: ['Reaktion', 'Steuern'],
    rules: {
      1: ['Tippe links oder rechts, um die Spur zu wechseln.', 'Sammle ⭐ für Extrapunkte.', 'Nach drei Zusammenstössen ist das Rennen vorbei.'],
      2: ['Tippe links oder rechts, um die Spur zu wechseln – vier Spuren, mehr Verkehr.', 'Sammle ⭐ für Extrapunkte.', 'Nach drei Zusammenstössen ist das Rennen vorbei.'],
    },
    duration: '1–3 Min.',
    Play: lazy(() => import('./rennen/RennenGame.tsx')),
  },
  {
    id: 'memo',
    name: 'Memo-Blitz',
    tagline: 'Kurz hinschauen, Paare finden',
    description: 'Am Anfang sind alle Karten kurz offen. Merk dir, wo die Bilder liegen, und finde alle Paare mit möglichst wenigen Zügen.',
    emoji: '🧠',
    colors: ['#8b5cf6', '#2ec5ff'],
    skills: ['Merken', 'Konzentration'],
    rules: {
      1: ['12 Karten, am Anfang 4 Sekunden offen.', 'Decke zwei Karten auf – gleiche Bilder bleiben offen.', 'Wenige Züge und schnell sein gibt mehr Punkte.'],
      2: ['20 Karten, am Anfang nur 3 Sekunden offen.', 'Decke zwei Karten auf – gleiche Bilder bleiben offen.', 'Wenige Züge und schnell sein gibt mehr Punkte.'],
    },
    duration: '1–2 Min.',
    Play: lazy(() => import('./memo/MemoGame.tsx')),
  },
  {
    id: 'farben',
    name: 'Farben-Fänger',
    tagline: 'Nur die richtige Farbe antippen',
    description: 'Blasen steigen auf. Tippe nur die Blasen in der gesuchten Farbe an – und pass auf, wenn die Farbe wechselt.',
    emoji: '🫧',
    colors: ['#2ec5ff', '#9be15d'],
    skills: ['Aufmerksamkeit', 'Reaktion'],
    rules: {
      1: ['Oben steht, welche Farbe gesucht ist.', 'Richtige Blase: Punkte. Falsche Blase: Abzug.', 'Die Farbe wechselt ab und zu – 40 Sekunden lang.'],
      2: [
        'Oben steht, welche Farbe gesucht ist – das Wort zählt, nicht seine Farbe.',
        'Auf den Blasen stehen Wörter: Es zählt die Farbe der Blase, nicht das Wort.',
        'Mehrere richtige hintereinander geben Bonuspunkte – 45 Sekunden lang.',
      ],
    },
    duration: '1 Min.',
    Play: lazy(() => import('./farben/FarbenGame.tsx')),
  },
  {
    id: 'muster',
    name: 'Muster-Meister',
    tagline: 'Was kommt als Nächstes?',
    description: 'Finde die Regel hinter der Reihe – Farben, Formen, Pfeile oder Zahlen – und wähle, was an die Stelle des Fragezeichens gehört.',
    emoji: '🧩',
    colors: ['#ffd23f', '#ff8a3d'],
    skills: ['Logik', 'Muster erkennen'],
    rules: {
      1: ['10 Reihen mit Farben und Formen.', 'Wähle, was an die Stelle von ❓ gehört.', 'Schnell und richtig gibt mehr Punkte.'],
      2: ['10 Reihen mit Formen, Pfeilen und Zahlen.', 'Wähle, was an die Stelle von ❓ gehört.', 'Schnell und richtig gibt mehr Punkte.'],
    },
    duration: '2 Min.',
    Play: lazy(() => import('./muster/MusterGame.tsx')),
  },
  {
    id: 'sortier',
    name: 'Sortier-Rutsche',
    tagline: 'Links oder rechts – schnell sortieren',
    description: 'Dinge rutschen herunter. Sortiere jedes in die richtige Kiste, bevor es unten ankommt. Es wird immer schneller.',
    emoji: '🛝',
    colors: ['#9be15d', '#2ec5ff'],
    skills: ['Einordnen', 'Tempo'],
    rules: {
      1: ['Tippe auf die linke oder rechte Kiste – oder wische.', 'Obst oder Gemüse, Land oder Wasser …', 'Drei Fehler, dann ist die Runde vorbei.'],
      2: ['Tippe auf die linke oder rechte Kiste – oder wische.', 'Gerade oder ungerade, Nomen oder Verb, Säugetier oder nicht …', 'Drei Fehler, dann ist die Runde vorbei.'],
    },
    duration: '1–2 Min.',
    Play: lazy(() => import('./sortier/SortierGame.tsx')),
  },
];

export function getSoloGame(id: string | undefined): SoloGame | undefined {
  return SOLO_GAMES.find((game) => game.id === id);
}

/** Cars of Phoni-Rennen – the first is free, the others cost coins while «Belohnungen» is on. */
export const CARS = [
  { id: 'flitzer', name: 'Flitzer', color: '#ff4f6d', price: 0, hearts: 3, shift: 170, bonus: 1, magnet: false, perk: 'Der Klassiker' },
  { id: 'blitz', name: 'Blitz', color: '#ffd23f', price: 30, hearts: 3, shift: 100, bonus: 1.1, magnet: false, perk: 'Wechselt blitzschnell die Spur · +10 % Punkte' },
  { id: 'truck', name: 'Monstertruck', color: '#2bb673', price: 60, hearts: 4, shift: 170, bonus: 1, magnet: false, perk: 'Hält einen Zusammenstoss mehr aus' },
  { id: 'rakete', name: 'Rakete', color: '#8b5cf6', price: 120, hearts: 4, shift: 110, bonus: 1.2, magnet: true, perk: 'Zieht Sterne an · 4 Herzen · +20 % Punkte' },
] as const;

export type Car = (typeof CARS)[number];

export function getCar(id: string | undefined): Car {
  return CARS.find((car) => car.id === id) ?? CARS[0];
}
