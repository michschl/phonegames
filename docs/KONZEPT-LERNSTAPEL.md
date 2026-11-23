# Konzept: Lernen (früher «Spickzettel»)

Schulstoff spielerisch repetieren – im selben Look wie die Partyspiele. Lerninhalte werden mit ein paar Fotos
erfasst, eine KI in der Schweiz macht daraus Lernkarten, und derselbe Kartenstapel lässt sich danach in
verschiedenen Spielformen spielen, allein oder in der Gruppe. Stapel lassen sich per Link teilen.

Stand: Etappen 1–4 umgesetzt (Erfassen per Foto und Text, Prüfen, Kartenkasten, Duell, Blitzrunde, Teilen per Link),
dazu Schätzrunde, Lückentext, ein eigener Tab «Lernen» mit Lernstand und «Diese Woche», Münzen fürs Lernen
(«Belohnungen») und der zweite Bereich «Aufgaben» für die Prüfungsvorbereitung (Konzept:
[KONZEPT-AUFGABEN.md](KONZEPT-AUFGABEN.md)).

## Entscheide

| Thema | Entscheid |
|---|---|
| Erfassen | Mehrere Fotos pro Stapel; eine KI wertet sie aus |
| Auswertung | Einmal in ein neutrales Kartenformat; die App leitet alle Spielformen selbst daraus ab |
| Kontrolle | Prüfschritt vor dem Speichern ist Pflicht; unsichere Stellen sind markiert |
| Fotos | Werden nur weitergereicht, nie gespeichert – gespeichert werden nur die Karten |
| KI-Anbieter | Infomaniak (Rechenzentren in der Schweiz), offene Modelle, z. B. ein Qwen-Modell mit Bildverständnis |
| Teilen | Link mit nicht erratbarer ID; Empfänger übernehmen eine Kopie in ihre Sammlung |
| Empfänger ohne Konto | Brauchen ein eigenes Konto (mit Einladungscode bzw. Abo); anfangs galt der Link als Einladung, seit dem Jahresabo nicht mehr |
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
| **Schätzrunde** | 1–30 | Zahlen und Jahreszahlen: alle schätzen geheim (Handy weitergeben), die Antwort zählt hoch, ein Zahlenstrahl zeigt alle Schätzungen. Volltreffer 3, ganz nah 2, nah dran 1 Punkt, am nächsten +1 | ≥ 3 Karten mit Zahl |
| **Lückentext** | Allein | Der Text Seite für Seite (bis 5 Sätze), Lücken mit der Wortbank füllen (antippen) oder eintippen, dann prüfen | ≥ 3 Sätze mit Lücke |

- **Fehler fliessen zurück:** Karten, die in Blitzrunde oder Duell danebengingen, landen im Kartenkasten der
  betreffenden Person in Fach 1.
- **Antwort prüfen** in drei Stufen, je nach Spielform vorgewählt: Selbstkontrolle (aufdecken, «gewusst?»),
  Auswahl aus vier, Eintippen (tolerant: Gross-/Kleinschreibung egal, Akzente und Artikel wahlweise egal).
- **Abfragerichtung bei Wörtli:** Vor der Runde wählt man pro Stapel, was gezeigt wird – wie erfasst
  («FR → DE»), umgekehrt («DE → FR») oder gemischt (die Hälfte der Wörtli in die andere Richtung, zufällig).
  Kennt der Stapel seine Sprachen nicht (abgetippt), heissen die Knöpfe «Normal», «Umgekehrt», «Gemischt»;
  ein Satz mit einer Karte des Stapels erklärt die Wahl («Umgekehrt: «der Hund» → «le chien»»). Gilt für
  Kartenkasten, Duell und Blitzrunde; nur Karten der Art «Übersetzung» drehen, Fragen und Lücken bleiben.
  Umgedreht zählen alle Wörter mit derselben Übersetzung als richtig («viel» → «beaucoup» oder «très»), die
  falschen Antworten der Auswahl stammen aus derselben Sprache. Der Kartenkasten ist derselbe für beide
  Richtungen: eine Karte rückt ein Fach weiter, egal in welcher Richtung sie gewusst wurde. Die Wahl wird auf
  dem Gerät gemerkt.
- **Schätzrunde – wann ist es «nah»?** Jahreszahlen: genau, ±5 Jahre, ±25 Jahre. Andere Zahlen: genau (Rundung),
  innerhalb 5 % (bei ganzen Zahlen mindestens ±1), innerhalb 20 % (mindestens ±3). Weit daneben → Fach 1.
- **Lückentext – Karten:** ein Satz mit genau einer Lücke `___`, die Antwort ist das fehlende Wort. Die Karten
  bleiben in der Reihenfolge des Textes; so ergibt sich beim Spielen wieder der Text. Dieselben Karten funktionieren
  auch im Kartenkasten, im Duell und in der Blitzrunde (Satz mit Lücke, nach dem Aufdecken ausgefüllt).

## Kartenformat

```ts
interface Stapel {
  id: string;
  title: string;
  subject?: string;            // «Französisch», «Geografie» …
  languages?: [string, string]; // z. B. ['fr', 'de'] bei Wörtli
  cards: Karte[];
  suggestedModes: ('blitz' | 'duell' | 'kasten' | 'schaetzen' | 'luecke')[];
  source: 'photo' | 'text' | 'shared';
  createdAt: number;
  updatedAt: number;
}

interface Karte {
  id: string;
  kind: 'translation' | 'definition' | 'qa' | 'number' | 'cloze';
  prompt: string;              // Frage / Wort / Begriff / Satz mit Lücke «___»
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
- **Zwei Arten der Auswertung** (Wahl auf der Foto-Seite, pro Gerät gemerkt):
  - **Genau übernehmen** (Standard): nur was auf den Fotos steht.
  - **Neue Aufgaben erfinden:** Die KI erkennt Fach, Thema, Stufe und Art der Aufgaben und erfindet 10, 20 oder 30
    neue, ähnliche Karten (dieselben Kartenarten, keine Wiederholung vom Blatt, Titel «… – Übung»). Danach prüft
    dieselbe KI die erfundenen Karten in einem zweiten, reinen Textaufruf als «kritische Lehrperson» (fachlich
    falsch, mehrdeutig, Antwort schon in der Frage, falscher Artikel). Auffällige Karten sind in der Prüfansicht gelb
    markiert, mit Grund («Möglicherweise falsch – Der längste Fluss ist der Rhein …»); sie werden nicht still
    gelöscht. Im Test fand die Kontrolle beide echten Fehler eines Durchgangs (Inn als längster Fluss, Gotthard
    zwischen «Nord- und Südtessin»), meldet aber auch einzelne Fehlalarme. Deshalb bittet die Prüfansicht bei
    erfundenen Karten ausdrücklich, jede Karte zu prüfen.
- **Regeln im Prompt:**
  - beim Übernehmen nur, was auf den Fotos steht – nichts dazuerfinden (Ausnahme: falsche Antworten für die Auswahl)
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
  | 1 Foto, 12 Karten erfinden + Kontrolle | ~2 900 / ~1 900 | 8 s | ca. CHF 0.007 |

  Selbst grosszügige Limiten bleiben günstig: 30 Auswertungen pro Monat mit je 6 Fotos kosten pro Person höchstens
  rund 60 Rappen. Die konkreten Werte legt der Betreiber fest.

## Teilen

- «Link teilen» erzeugt eine Freigabe mit zufälliger ID (128 Bit) → `https://phonegames.app/s/<id>`.
- Der Server speichert eine Kopie des Stapels (nur Karten, kein Lernstand). Die Person, die den Stapel geteilt hat,
  kann die Freigabe aktualisieren oder widerrufen.
- **Mit Konto:** Link öffnen → Vorschau (Titel, Fach, Anzahl Karten, erste Karten) → «In meine Stapel übernehmen».
  Die Übernahme ist eine eigene Kopie, die man frei bearbeiten kann.
- **Ohne Konto:** Die Seite zeigt Titel und Anzahl Karten und «Konto erstellen & übernehmen». Die Registrierung
  läuft wie sonst (mit Einladungscode bzw. Abo); danach wird der Stapel automatisch übernommen. Wer teilt, sieht, wie
  viele neue Konten über den Link entstanden sind.
- **Schutz:** Freigaben sind nicht auffindbar (keine Liste, keine Suche, `noindex`); Rate-Limit beim Erstellen von
  Freigaben. Weil der Link keine Einladung mehr ist, braucht es keine Grenze für Registrierungen pro Link.

## Datenschutz und Recht

- Die Fotos verlassen die Schweiz nicht (Infomaniak, Rechenzentren in der Schweiz) – das passt zum Hinweis
  «Entwickelt und betrieben in der Schweiz». Die Bedingungen von Infomaniak zu Speicherung und Training sind vor
  dem Start zu prüfen.
- Hinweis bei der Foto-Funktion: «Deine Fotos werden in der Schweiz ausgewertet und danach gelöscht. Bitte keine
  Namen oder Noten fotografieren.»
- ✅ Die Datenschutzerklärung (`/datenschutz`) beschreibt die KI-Auswertung.
- Urheberrecht: Teilen nur von eigenen oder erlaubten Inhalten – ✅ Hinweis in den Nutzungsbedingungen (`/agb`); vor
  dem Start rechtlich abklären (ganze Lehrmittelseiten).
- Über Kinder werden keine Daten benötigt: Stapel enthalten nur Lernstoff, der Lernstand hängt an Spielernamen der
  Gruppe.

## Technische Umsetzung

| Teil | Umsetzung |
|---|---|
| Server | `POST /api/learn/extract` (angemeldet, Limit, Grössenlimit, Infomaniak-Aufruf), Stapel und Lernstand im Sync, `POST/DELETE /api/shares`, `GET /api/shares/:id`, Registrierung mit Freigabe-ID (zählt die neuen Konten pro Link) |
| Datenbank | Tabellen für Stapel, Lernstand, Freigaben und Auswertungs-Zähler (Migration) |
| Client | Tab «Lernen» (Heute dran, Stapelliste, Stapelseite), Erfassen, Prüfen, Teilen, die Spielformen in `games/spickzettel/` (intern weiter «Spickzettel»), Route `/s/:id` |
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
3. **Teilen:** ✅ Freigaben, Link als Einladung (höchstens 50 neue Konten pro Link – mit dem Jahresabo wieder
   abgeschafft), Übernahme, geteilte Version aktualisieren, Freigabe beenden.
4. **Duell:** ✅ geteilter Bildschirm (obere Hälfte gedreht), gleiche Frage, je vier Antworten in eigener
   Reihenfolge, Antippen per Pointer-Events (beide gleichzeitig möglich), falscher Tipp sperrt 1,5 s und setzt die
   Karte im Kartenkasten der Person zurück in Fach 1; beide falsch → Lösung wird gezeigt. 10, 15 oder 20 Fragen.
5. Doku, Tests, Deploy.

## Ergänzungen nach den Etappen

- **Antworten eintippen** als dritte Antwortprüfung im Kartenkasten (siehe Etappe 2).
- **Allein lernen ohne Spielgruppe:** Kartenkasten und Lückentext brauchen keine Gruppe mehr. Der Kartenkasten
  gehört einem Namen; «Wer lernt?» bietet an, wer den Stapel schon gelernt hat, die Personen der zuletzt für
  Spickzettel gewählten Gruppe, die angemeldete Person und hinzugefügte Namen (`collectLearners`). Vorausgewählt
  ist, wer den Stapel zuletzt auf diesem Gerät gelernt hat. Der Start führt direkt zur ersten Karte.
- **Personen hinzufügen** («Person hinzufügen» in «Wer lernt?»): Der Name bekommt gleich einen leeren Kartenkasten
  für den Stapel. Der wird synchronisiert – so steht der Name auf allen Geräten, samt Lernstand, und wird auch bei
  den anderen Stapeln angeboten. Namen, die ältere Versionen nur auf dem Gerät gemerkt hatten (`learnerNames`),
  wandern beim Öffnen einer Stapelseite so in die synchronisierten Daten.
- **Personen entfernen:** «Bearbeiten» neben «Wer lernt?» – ein Tipp auf eine Person entfernt sie aus diesem Stapel,
  auf allen Geräten, mit «Rückgängig». Der Lernstand der Person für den Stapel wird zur Markierung «entfernt»
  (`LearnProgress.removed`, leerer Kartenkasten, keine Lerntage) und synchronisiert. Bewusst kein gelöschter
  Eintrag: Die werden nach 180 Tagen aufgeräumt, die Person käme zurück. Ein Name, der nur für diesen Stapel
  hinzugefügt wurde, verschwindet damit ganz. Wer wieder hinzugefügt wird oder den Stapel doch lernt (z. B. im
  Duell), ist wieder dabei – auch auf den anderen Geräten. In anderen Stapeln bleibt die Person.
- **«Speichern & lernen»** nach dem Prüfen: Ist klar, wer lernt (wer den Stapel schon gelernt hat oder die einzige
  Person, die überhaupt lernt), startet gleich die erste Runde; sonst fragt «Wer lernt?».
- **Spielformen nach Situation:** «Allein» (Kartenkasten, Lückentext), «Zu zweit» (Duell), «Mit mehreren»
  (Blitzrunde, Schätzrunde). Was der Stapel nicht hergibt (`modeFits`), wird nicht angeboten.
- **«Heute fällig»** (zuerst auf der Startseite, heute «Heute dran» im Tab «Lernen»): Sobald jemand Karten gelernt
  hat und welche wieder fällig sind, erscheint eine Zeile pro Person und Stapel («Lea · 7 Karten · «Unité 5»»). Ein Tipp startet
  direkt die erste fällige Karte (`/lernen/<stapel>/kasten?person=Lea`). Neue, noch nie gelernte Karten zählen
  nicht – die Erinnerung soll ans Repetieren erinnern, nicht drängen.
- **Stand pro Person auf einen Blick:**
  - «Wer lernt?» (Kartenkasten, Lückentext): Die Namenstafeln sind nach Stand eingefärbt und nennen ihn:

    | Farbe | Stand | Badge |
    |---|---|---|
    | Orange | Karten zum Wiederholen fällig («3 fällig · 2 neu») | rote Zahl |
    | Blau | Nichts fällig, aber noch neue Karten | – |
    | Grün | Heute erledigt | ✓ |
    | Gelb | Alle Karten in Fach 5 | ★ |
    | Weiss | Noch nicht begonnen | – |

  - «Wer lernt?» steht auf der Stapelseite – mit denselben Farben, der roten Zahl der fälligen Karten (bzw. ✓/★)
    und einer kurzen Legende.
  - Die Stapel-Liste im Tab «Lernen» zeigt «3 fällig» – summiert über alle Personen.
- **Stapelwahl zum Zusammenspielen:** Der Startbildschirm des Spiels schlägt 3 Stapel vor – zuerst die mit fälligen
  Karten, dann die zuletzt gelernten oder bearbeiteten (`recommendStacks`); der gewählte ist immer dabei. «Anderer
  Stapel» öffnet alle Stapel alphabetisch, ab 7 Stapeln mit Suche nach Titel oder Fach.
- **Schätzrunde und Lückentext** (siehe Spielformen). Angeboten wird nur, was der Stapel hergibt (`modeFits`);
  passende Formen tragen einen Stern.
- **Erfassen von Lückentexten:** Beim Abtippen steht das fehlende Wort in eckigen Klammern («Die Aare fliesst durch
  [Bern].», mehrere Klammern → eine Karte pro Lücke). In der Prüfansicht wird ein Satz mit `___` oder `[Wort]`
  automatisch zur Lückentext-Karte. Die KI macht aus Lückentexten (mit Lösungen) und Merktexten Lückentext-Karten
  und aus Zahlen Zahlenkarten; Test mit einem Arbeitsblatt «Die Schweiz»: 5 Lücken und 4 Zahlenkarten richtig
  erkannt, Name weggelassen, Schätzrunde und Lückentext vorgeschlagen.

## Einfachere Bedienung

Ausgangslage: Spickzettel steckte zwischen den Partyspielen, wer allein lernte, brauchte eine Spielgruppe, und die
Vorbereitungsseite fragte alles auf einmal (Stapel, fünf Spielformen, Gruppe, Einstellungen). Vom fotografierten
Blatt bis zur ersten Karte waren es 10 Tipps plus ein Name, für die fälligen Karten des Tages 3 Tipps.

**Etappe 1 – allein ohne Gruppe, ein Tipp bis zur Karte** (siehe Ergänzungen): «Wer lernt?» statt Spielgruppe,
direkte Route `/lernen/<stapel>/<kasten|luecke>?person=…`, «Heute fällig» mit einer Zeile pro Person und Stapel,
«Speichern & lernen», Spielformen nach Situation.

**Etappe 2 – eigener Tab «Lernen»:**

| Seite | Inhalt |
|---|---|
| `/lernen` (Tab) | «Heute dran»: eine Zeile pro Person und Stapel, ein Tipp startet die erste fällige Karte · «Alles erledigt» mit dem nächsten Termin · alle Stapel mit «fällig»-Zahl und Menü (Lernen, Bearbeiten, Löschen) · beim ersten Mal eine Einführung in drei Schritten mit «Foto aufnehmen» und «Karten abtippen» |
| `/lernen/<stapel>` | «Wer lernt?» · Kartenkasten der gewählten Person mit Fächern, Stand, Abfragerichtung bei Wörtli (pro Stapel gemerkt) und Antwortart (Aufdecken, Auswahl, Tippen – pro Person gemerkt) · «Weitere Spielformen» mit je einem Satz: Lückentext (allein, direkt), Duell, Blitzrunde, Schätzrunde (führen zum Startbildschirm mit Gruppe) · Karten pro Runde und Lückentext-Eingabe unter «Weitere Einstellungen» · unten der grosse Knopf «12 Karten lernen · Lina» |
| `/spiel/spickzettel` | Nur noch zum Zusammenspielen: Stapel, Spielform (zu zweit, mit mehreren), Spielgruppe, Einstellungen; vier kurze Regeln statt sieben – später ersetzt durch «Wer spielt mit?» (siehe unten) |

Die Spickzettel-Karten in «Spiele» und «Entdecken» führen zu `/lernen` (`GameDefinition.href`), `/stapel` leitet
dorthin um, Bearbeiten (`/stapel/<id>`) kehrt zur Stapelseite zurück. Nach dem Speichern eines neuen Stapels geht es
direkt in die erste Runde, wenn klar ist, wer lernt – sonst auf die Stapelseite.

**Etappe 3 – motivieren:**

- **Ende einer Runde:** Ist nichts mehr fällig, steht «Alles erledigt für heute 🎉» und wann es weitergeht («Die
  nächsten 4 Karten sind morgen dran», `nextRepetition`). Darunter «Fertig», ein Vorschlag zum Zusammenspielen –
  «Duell gegen Ben», wenn noch jemand den Stapel lernt; sind beide in einer Gruppe, ist sie vorausgewählt
  (`?gruppe=`) – und «Weiter üben». Ist noch etwas fällig, geht es wie bisher mit «Weiter».
- **Lernserie:** Jede Antwort markiert den Tag (lokales Datum) im Lernstand der Person (`LearnProgress.days`,
  höchstens 60 pro Stapel, synchronisiert). Über alle Stapel zählt `learnStreak` die Tage in Folge; wer gestern
  gelernt hat und heute noch nicht, behält die Serie bis zum Abend. Ab zwei Tagen zeigt «🔥3» sie auf der
  Namenstafel und in «Heute dran», nach der Runde «🔥 3 Tage in Folge gelernt – weiter so!».
- **Lernstand sichtbar** ([`components/LearnCharts.tsx`](../client/src/components/LearnCharts.tsx)): In der
  Stapelliste trägt jeder Stapel einen dünnen Balken in den Farben der fünf Fächer mit dem Prozentwert – über alle
  Lernenden, neue Karten sind der leere Rest, 100 % heisst alles in Fach 5 (`stackMastery`). «Diese Woche» im Tab
  «Lernen» zeigt für bis zu fünf Personen einen Punkt für jeden der letzten sieben Tage mit Lernen und die Serie
  (`learningWeek`).
- **Münzen fürs Lernen:** Ist «Belohnungen» an (Konto → Belohnungen), gibt jede gewusste Karte im Kartenkasten und
  jede richtige Lücke im Lückentext Münzen für «Allein spielen», bis zu einem Tageslimit pro Person; Übungsrunden
  zählen nicht.

| Ablauf | Vorher | Jetzt |
|---|---|---|
| Neues Blatt → erste Karte | 10 Tipps + Name eintippen | 6 Tipps; ein neuer Name nur einmal |
| Fällige Karten lernen | 3 Tipps | 2 Tipps (Tab «Lernen» mit Badge, dann die Zeile in «Heute dran») |

**Ein Ort, ein Name:** Nach Etappe 2 gab es zwei Wege zu denselben Entscheidungen – Stapel und Spielform liessen
sich im Tab «Lernen» und nochmals auf dem Startbildschirm des Spiels wählen, und es hiess mal «Spickzettel», mal
«Lernen». Jetzt:

- Der Bereich heisst überall **«Lernen»** und ist eine eigene Kategorie: ein Tab, kein Spiel in «Spiele»,
  «Entdecken», «Meine Spiele» oder «Weiterspielen» (die Definition steht in `registry.ts` unter `SECTIONS`). Intern
  bleibt die ID `spickzettel` – sie steht in Bibliotheken und Einstellungen der Nutzerinnen und Nutzer.
- Zusammenspielen startet auf der Stapelseite: «Duell», «Blitzrunde» oder «Schätzrunde» führen zu
  `/lernen/<stapel>/<spielform>` – **«Wer spielt mit?»** mit Spielgruppe, Einstellungen und Start. Stapel und
  Spielform werden nicht nochmals gefragt. Nach dem Spiel geht es dorthin zurück, bereit für eine Revanche.
- Den Startbildschirm `/spiel/spickzettel` gibt es nicht mehr; er leitet weiter (`GameDefinition.pathFor`).
- Die Stapelliste in «Lernen» zeigt zuerst Stapel mit fälligen Karten, dann die zuletzt gelernten oder bearbeiteten
  (`recommendStacks`), ab 7 Stapeln mit Suche nach Titel oder Fach.
- **Neuer Stapel dort, wo die Stapel sind:** Statt eines Plus-Symbols oben rechts (beim Scrollen weg und ohne
  Beschriftung) schliesst die Stapelliste mit der Kachel «Neuer Stapel – Foto aufnehmen oder Karten abtippen»; ab
  vier Stapeln steht zusätzlich «Neuer Stapel» neben der Überschrift «Stapel».
- **«So geht’s»** im Tab «Lernen» unter «Heute dran» (und «Diese Woche») – ein eigener Abschnitt wie «Heute dran» und «Stapel», darin
  zugeklappt «In fünf Schritten»: Stapel erstellen, wer lernt, Kartenkasten mit
  den Abständen, «Heute dran» und der Badge, zusammen lernen. Beim allerersten Besuch zeigt die Einführung drei
  Schritte.
- Fällige Karten gehören zu «Lernen», nicht auf die Startseite der Spiele: Die Zeilen «Heute fällig» sind von der
  Startseite in «Heute dran» umgezogen. Dafür trägt das Symbol des Tabs «Lernen» einen roten Badge mit der Zahl
  aller fälligen Karten (alle Personen, alle Stapel, `useDueTotal`; Screenreader: «Lernen, 7 Karten fällig»). Neue,
  noch nie gelernte Karten zählen nicht mit.
- Seit «Aufgaben» hat der Tab oben «Karten | Aufgaben» und öffnet den zuletzt benutzten Bereich; Prüfungen der
  nächsten 7 Tage stehen ebenfalls in «Heute dran».

## Offene Punkte

- Gegenprobe mit echten Handyfotos (schräg, Schatten, echte Kinderhandschrift, Mathematik).
- Qwen 3.8 ist bei Infomaniak noch Beta – Ersatzmodell festlegen, falls es sich ändert.
- Konkrete Limiten (die Kosten erlauben deutlich mehr als 5 pro Monat).
- Rechtliche Abklärung zum Teilen von Lehrmittel-Inhalten.
