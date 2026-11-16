# Konzept: Lernspiel «Spickzettel» (Arbeitstitel)

Schulstoff spielerisch repetieren – im selben Look wie die Partyspiele. Lerninhalte werden mit ein paar Fotos
erfasst, eine KI in der Schweiz macht daraus Lernkarten, und derselbe Kartenstapel lässt sich danach in
verschiedenen Spielformen spielen, allein oder in der Gruppe. Stapel lassen sich per Link teilen.

Stand: Etappen 1–4 umgesetzt (Erfassen per Foto und Text, Prüfen, Kartenkasten, Duell, Blitzrunde, Teilen per Link).

## Entscheide

| Thema | Entscheid |
|---|---|
| Erfassen | Mehrere Fotos pro Stapel; eine KI wertet sie aus |
| Auswertung | Einmal in ein neutrales Kartenformat; die App leitet alle Spielformen selbst daraus ab |
| Kontrolle | Prüfschritt vor dem Speichern ist Pflicht; unsichere Stellen sind markiert |
| Fotos | Werden nur weitergereicht, nie gespeichert – gespeichert werden nur die Karten |
| KI-Anbieter | Infomaniak (Rechenzentren in der Schweiz), offene Modelle, z. B. ein Qwen-Modell mit Bildverständnis |
| Teilen | Link mit nicht erratbarer ID; Empfänger übernehmen eine Kopie in ihre Sammlung |
| Empfänger ohne Konto | Brauchen ein eigenes Konto; der Link gilt als Einladung (Registrierung ohne Einladungscode) |
| Kosten | Trägt der Betreiber |
| Limiten | Pro Benutzer, z. B. 5 Auswertungen pro Monat – Wert wird nach dem Kostentest festgelegt |

## Ablauf für Benutzer

1. **Stapel erfassen** – «Neuer Stapel» → Fotos aufnehmen oder aus der Galerie wählen (mehrere Seiten möglich).
   Optional Titel und Fach. Anzeige: «Noch 4 Auswertungen diesen Monat».
2. **Auswerten** – Phoni «liest» die Fotos (Fortschrittsanzeige). Braucht Internet.
3. **Prüfen & korrigieren** – Kartenliste zum Bearbeiten: Frage, Antwort, Löschen, Hinzufügen. Unsichere Stellen sind
   gelb markiert («Bitte prüfen: Handschrift unklar»). Erst danach «Stapel speichern».
4. **Spielen** – Auf der Stapel-Seite stehen die passenden Spielformen; die von der KI empfohlenen sind hervorgehoben.
5. **Teilen** – «Link teilen» öffnet das Teilen-Menü des Handys (WhatsApp, Mail, …).

## Spielformen

Alle Spielformen arbeiten mit demselben Kartenformat.

| Spielform | Wer | Ablauf | Voraussetzung |
|---|---|---|---|
| **Blitzrunde** | Teams, 2–30 | 60 s pro Zug: Frage lesen, Antwort laut sagen, aufdecken, Runde entscheidet «richtig/nochmal». Punkte, Ticken, Fanfare (Team-Spielbausteine) | ≥ 10 Karten |
| **Duell** | 2 Personen, Handy liegt dazwischen | Geteilter Bildschirm, Frage für beide Seiten lesbar, je 4 Antworten. Wer zuerst richtig tippt, punktet; falscher Tipp sperrt kurz | Falsche Antworten vorhanden oder ≥ 4 Karten derselben Art |
| **Kartenkasten** | Allein, täglich ein paar Minuten | Lernkartei mit 5 Fächern: gewusst → ein Fach weiter, vergessen → zurück in Fach 1. «Heute fällig: 12 Karten», Serie, Konfetti bei «gemeistert» | – |

- **Fehler fliessen zurück:** Karten, die in Blitzrunde oder Duell danebengingen, landen im Kartenkasten der
  betreffenden Person in Fach 1.
- **Antwort prüfen** in drei Stufen, je nach Spielform vorgewählt: Selbstkontrolle (aufdecken, «gewusst?»),
  Auswahl aus vier, Eintippen (tolerant: Gross-/Kleinschreibung egal, Akzente und Artikel wahlweise egal).
- Später möglich: Jahreszahlen/Zahlen als Schätzrunde, Lückentexte.

## Kartenformat

```ts
interface Stapel {
  id: string;
  title: string;
  subject?: string;            // «Französisch», «Geografie» …
  languages?: [string, string]; // z. B. ['fr', 'de'] bei Wörtli
  cards: Karte[];
  suggestedModes: ('blitz' | 'duell' | 'kasten')[];
  source: 'photo' | 'text' | 'shared';
  createdAt: number;
  updatedAt: number;
}

interface Karte {
  id: string;
  kind: 'translation' | 'definition' | 'qa' | 'number';
  prompt: string;              // Frage / Wort / Begriff
  answer: string;
  accepted?: string[];         // weitere richtige Antworten («la voiture», «voiture»)
  distractors?: string[];      // genau 3 plausible falsche Antworten – von der KI ergänzt, gekennzeichnet
  uncertain?: string;          // Grund, falls die KI unsicher war – nur bis zur Prüfung
}
```

- **Lernstand** (Fach 1–5, nächste Fälligkeit) wird pro Person und Karte getrennt vom Stapel gespeichert –
  ein geteilter Stapel enthält keinen Lernstand und keine Namen.
- Stapel und Lernstand werden wie Spielgruppen gespeichert und abgeglichen (offline-first, Sync mit dem Server).
  Gespielt wird auch offline; nur Auswerten und Teilen brauchen Internet.

## KI-Auswertung

- **Anbieter:** Infomaniak AI, OpenAI-kompatible Schnittstelle
  `POST https://api.infomaniak.com/2/ai/{product_id}/openai/v1/chat/completions`, Bearer-Token.
  Modellliste mit `GET /1/ai/models`.
- **Modell:** `Qwen/Qwen3.8-27B-FP8` (versteht Bilder; bei Infomaniak als Beta markiert). Die Modell-ID ist
  konfigurierbar (`LEARN_AI_MODEL`), damit bei Änderungen ohne neuen Code gewechselt werden kann.
- **Ohne «Nachdenken»:** `reasoning_effort: "none"` ist nötig. Mit eingeschaltetem Denken verbrauchte das Modell im
  Test alle 6000 Ausgabe-Tokens fürs Nachdenken und lieferte keine Karten.
- **Ausgabe:** festes JSON-Schema über `response_format: { type: 'json_schema' }`; der Server prüft das Ergebnis
  zusätzlich mit zod und wiederholt bei ungültigem JSON einmal.
- **Regeln im Prompt:**
  - nur übernehmen, was auf den Fotos steht – nichts dazuerfinden (Ausnahme: falsche Antworten für die Auswahl)
  - Namen, Noten, Unterschriften und andere Personendaten weglassen
  - unsichere Stellen mit Grund markieren
  - Sprache und Art der Karten erkennen, passende Spielformen vorschlagen
- **Fotos:** im Browser auf ca. 2000 px (lange Seite) verkleinert, als JPEG gesendet; max. 6 Fotos pro Auswertung.
  Der Server speichert und protokolliert sie nicht, sondern verwirft sie nach der Antwort.
- **Fehler:** Zeitüberschreitung oder Fehler der KI → freundliche Meldung; eine fehlgeschlagene Auswertung zählt
  nicht ans Limit.
- **Alternative ohne Foto:** Text einfügen (z. B. «le chien = der Hund», eine Zeile pro Karte) – wird ohne KI erkannt.

## Limiten und Kosten

- Pro Benutzer **N Auswertungen pro Kalendermonat** (Startwert 5, `LEARN_MONTHLY_LIMIT`). Gezählt wird in der
  Datenbank (Konto, Monat, Anzahl). Die App zeigt, wie viele noch übrig sind.
- **Notbremse:** globales Monatslimit über alle Konten (`LEARN_GLOBAL_MONTHLY_LIMIT`).
- Zusätzlich Rate-Limit pro Minute gegen Doppel-Tipps und Missbrauch.
- Kosten trägt der Betreiber. Der Verbrauch lässt sich bei Infomaniak abrufen (`GET /1/ai/{product_id}/consumptions`).
- **Gemessene Kosten** (Qwen 3.8, aus dem Infomaniak-Verbrauch abgeleitet: CHF 0.40 pro 1 Mio. Eingabe-Tokens,
  CHF 3.00 pro 1 Mio. Ausgabe-Tokens; ein Foto zählt als rund 2000 Tokens):

  | Auswertung | Tokens (ein/aus) | Dauer | Kosten |
  |---|---|---|---|
  | 1 Foto (8 Karten) | 2 367 / 780 | 4.6 s | ca. CHF 0.003 |
  | 2 Fotos (20 Karten) | 4 369 / 1 569 | 6.7 s | ca. CHF 0.007 |
  | 6 Fotos (geschätzt) | ~12 400 / ~4 500 | – | ca. CHF 0.02 |

  Selbst grosszügige Limiten bleiben günstig: 30 Auswertungen pro Monat mit je 6 Fotos kosten pro Person höchstens
  rund 60 Rappen. Die konkreten Werte legt der Betreiber fest.

## Teilen

- «Link teilen» erzeugt eine Freigabe mit zufälliger ID (128 Bit) → `https://phonegames.app/s/<id>`.
- Der Server speichert eine Kopie des Stapels (nur Karten, kein Lernstand). Die Person, die den Stapel geteilt hat,
  kann die Freigabe aktualisieren oder widerrufen.
- **Mit Konto:** Link öffnen → Vorschau (Titel, Fach, Anzahl Karten, erste Karten) → «In meine Stapel übernehmen».
  Die Übernahme ist eine eigene Kopie, die man frei bearbeiten kann.
- **Ohne Konto:** Die Seite zeigt Titel und Anzahl Karten und «Konto erstellen». Der Link gilt als Einladung: Die
  Registrierung braucht dann keinen Einladungscode. Nach der Registrierung wird der Stapel automatisch übernommen.
- **Schutz:** Freigaben sind nicht auffindbar (keine Liste, keine Suche, `noindex`); widerrufene Links gelten
  auch nicht mehr als Einladung; Rate-Limit beim Erstellen von Freigaben. Ob die Zahl der Registrierungen pro Link
  begrenzt werden soll, ist offen.

## Datenschutz und Recht

- Die Fotos verlassen die Schweiz nicht (Infomaniak, Rechenzentren in der Schweiz) – das passt zum Hinweis
  «Entwickelt und betrieben in der Schweiz». Die Bedingungen von Infomaniak zu Speicherung und Training sind vor
  dem Start zu prüfen.
- Hinweis bei der Foto-Funktion: «Deine Fotos werden in der Schweiz ausgewertet und danach gelöscht. Bitte keine
  Namen oder Noten fotografieren.»
- Datenschutzerklärung um die KI-Auswertung ergänzen.
- Urheberrecht: Teilen nur von eigenen oder erlaubten Inhalten – Hinweis in den Nutzungsbedingungen; vor dem
  Start rechtlich abklären (ganze Lehrmittelseiten).
- Über Kinder werden keine Daten benötigt: Stapel enthalten nur Lernstoff, der Lernstand hängt an Spielernamen der
  Gruppe.

## Technische Umsetzung

| Teil | Umsetzung |
|---|---|
| Server | `POST /api/learn/extract` (angemeldet, Limit, Grössenlimit, Infomaniak-Aufruf), Stapel und Lernstand im Sync, `POST/DELETE /api/shares`, `GET /api/shares/:id`, Registrierung mit Freigabe-ID statt Einladungscode |
| Datenbank | Tabellen für Stapel, Lernstand, Freigaben und Auswertungs-Zähler (Migration) |
| Client | Bereich «Stapel» (Liste, Erfassen, Prüfen, Teilen), Spiel «Spickzettel» mit den Spielformen, Route `/s/:id` |
| Konfiguration | Secrets `INFOMANIAK_AI_TOKEN`, `INFOMANIAK_AI_PRODUCT_ID`; Variablen `LEARN_AI_MODEL`, `LEARN_MONTHLY_LIMIT`, `LEARN_GLOBAL_MONTHLY_LIMIT` |

## Etappen

1. **Test:** ✅ mit nachgestellten Fotos (gedrucktes Französisch-Wörtliblatt, handschriftliche Heftseite mit Name und
   Note): alle 20 Karten korrekt, Akzente erhalten, Name und Note weggelassen, gute falsche Antworten (einmal falscher
   Artikel: «der Aare»). Offen: Gegenprobe mit echten Handyfotos.
2. **Grundlage:** ✅ Stapel erfassen (Foto und Text), Prüfansicht, Speichern und Sync, Kartenkasten (selbst prüfen
   oder Auswahl aus vier), Blitzrunde. Eintippen als dritte Antwortprüfung ist inzwischen auch umgesetzt (tolerant: Gross-/Kleinschreibung,
   Satzzeichen; fehlender Akzent, Artikel oder ein kleiner Tippfehler zählt als «fast richtig»; «Ich hatte recht»
   korrigiert). Bewusst nicht: Fehler aus der Blitzrunde in den Kartenkasten übernehmen – dort antwortet das Team,
   nicht eine Person.
3. **Teilen:** ✅ Freigaben, Link als Einladung (höchstens 50 neue Konten pro Link), Übernahme, geteilte Version
   aktualisieren, Freigabe beenden.
4. **Duell:** ✅ geteilter Bildschirm (obere Hälfte gedreht), gleiche Frage, je vier Antworten in eigener
   Reihenfolge, Antippen per Pointer-Events (beide gleichzeitig möglich), falscher Tipp sperrt 1,5 s und setzt die
   Karte im Kartenkasten der Person zurück in Fach 1; beide falsch → Lösung wird gezeigt. 10, 15 oder 20 Fragen.
   Weitere Spielformen (Schätzrunde für Zahlen, Lückentext) sind offen.
5. Doku, Tests, Deploy.

## Ergänzungen nach den Etappen

- **Antworten eintippen** als dritte Antwortprüfung im Kartenkasten (siehe Etappe 2).
- **«Heute fällig» auf der Startseite:** Sobald jemand Karten gelernt hat und welche wieder fällig sind, zeigt die
  Startseite «Heute fällig: 7 Karten · Lea · «Unité 5»». Ein Tipp öffnet den Stapel direkt im Kartenkasten. Neue,
  noch nie gelernte Karten zählen nicht – die Erinnerung soll ans Repetieren erinnern, nicht drängen.

## Offene Punkte

- Gegenprobe mit echten Handyfotos (schräg, Schatten, echte Kinderhandschrift, Mathematik).
- Qwen 3.8 ist bei Infomaniak noch Beta – Ersatzmodell festlegen, falls es sich ändert.
- Konkrete Limiten (die Kosten erlauben deutlich mehr als 5 pro Monat).
- Rechtliche Abklärung zum Teilen von Lehrmittel-Inhalten.
