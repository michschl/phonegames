# Architektur

```
┌──────────────────────── Handy (Browser / installierte PWA) ────────────────────────┐
│                                                                                     │
│  React-App ──► Zustand-Stores ──► localStorage   (Konto, Spiele, Gruppen, Settings) │
│      │              │                                                               │
│      │              └──► Sync-Engine ──fetch──┐                                     │
│      │                                        │                                     │
│  Service Worker (Workbox): App-Shell, JS, CSS, Schriften, Icons im Cache            │
└───────────────────────────────────────────────┼─────────────────────────────────────┘
                                                │ HTTPS (Caddy)
                                   ┌────────────▼────────────┐
                                   │ Fastify (Node.js 24)    │
                                   │  /api/auth  /api/account│
                                   │  /api/sync  /api/health │
                                   │  + statische PWA-Dateien│
                                   └────────────┬────────────┘
                                                │ node:sqlite
                                        ┌───────▼───────┐
                                        │ phonegames.db │
                                        └───────────────┘
```

Ein einziger Node-Prozess liefert die API **und** die gebaute PWA aus. Caddy davor kümmert sich um HTTPS,
Kompression und HTTP/3.

## Design-System

Das Aussehen steckt komplett in CSS-Variablen ([`client/src/styles/global.css`](../client/src/styles/global.css)):
Tinte (`--ink`) für Konturen und Text, Creme-Papier (`--bg`), kräftige Akzentfarben (`--pink`, `--yellow`, `--cyan`,
`--lime` …), harte Schatten (`--shadow`, `--shadow-lg`) und Konturen (`--border`). Komponenten
([`components.css`](../client/src/styles/components.css)), Seiten ([`pages.css`](../client/src/styles/pages.css)) und
Spiele ([`games/shared/game-shell.css`](../client/src/games/shared/game-shell.css)) bauen darauf auf. Jedes Spiel setzt
mit `accent` seine eigene Farbe; `GameShell` mit `night` schaltet auf die dunkle Variante um.

Regeln für Lesbarkeit und Bedienbarkeit (geprüft mit axe-core gegen WCAG 2.2 AA):

- **Text auf Farbe ist Tinte**, nicht Weiss: Weiss auf Pink oder Rot erreicht nur 3:1, Tinte rund 6:1. Weisse Schrift
  gibt es nur mit dicker Tinten-Kontur (Sticker-Titel).
- **Fliesstext nie in `--faint`** – das ist für Platzhalter und Symbole. Kleine Texte nutzen `--muted`.
- **Spielnamen brechen nur an Wortfugen** (`breakableName()` in [`lib/util.ts`](../client/src/lib/util.ts) plus
  `hyphens: manual`), sonst trennt der Browser «Zufallsfin-ger».
- **Knöpfe in Formularen bleiben drückbar.** Fehlt etwas, steht beim Absenden direkt am Feld, was – und der Cursor
  springt dorthin. Ein grauer Knopf ohne Erklärung lässt Leute rätseln.
- Jede Ansicht hat genau ein `<main>` und eine `<h1>`; Deko (Formen, Konfetti, Laufband) ist `aria-hidden`.

Maskottchen und Logo sind reine SVG-Komponenten (`Mascot`, `Logo` in
[`components/Brand.tsx`](../client/src/components/Brand.tsx)) mit den Stimmungen `happy`, `wink`, `wow`, `party`,
`sleepy` und `oops`. Die App-Icons werden mit `npm run icons` aus `client/public/icons/phoni.svg` erzeugt. Ändert sich das Motiv, bekommen
die Dateien neue Namen – Browser und Homescreens halten Icons sonst unter der alten Adresse fest.

## Offline-first

**Was offline geht:** alles nach der Anmeldung – Spiele starten und spielen, Spielgruppen anlegen und
bearbeiten, Spiele zur Liste hinzufügen oder entfernen.
**Was online sein muss:** Registrierung, Anmeldung, Profil-/Passwortänderungen, Datenexport und Konto löschen.

### Caching (Service Worker)

`vite-plugin-pwa` erzeugt beim Build einen Workbox-Service-Worker, der alle Dateien des Builds vorab cacht
(App-Shell, JavaScript aller 17 Spiele inklusive Inhalten, CSS, Schriften, Icons – zusammen rund 1 MB). Navigationen fallen offline auf
`index.html` zurück. `/api/*` wird **nicht** gecacht – die Daten verwaltet die App selbst.

**Neue Versionen ohne Neustart** ([`lib/pwa.ts`](../client/src/lib/pwa.ts),
[`components/UpdateHint.tsx`](../client/src/components/UpdateHint.tsx)):

- Gesucht wird, wenn die App wieder in den Vordergrund kommt, wenn sie wieder online ist und alle 15 Minuten,
  solange sie sichtbar ist (höchstens einmal pro Minute; `sw.js` wird mit `no-cache` ausgeliefert). Browser
  prüfen sonst nur beim Öffnen – eine PWA, die im Hintergrund schläft, blieb so bis zum Schliessen alt.
- Liegt eine neue Version bereit, lädt die App sie beim nächsten sicheren Moment: beim nächsten Seitenwechsel oder
  wenn die App wieder in den Vordergrund kommt – nie in einem laufenden Spiel, beim Bearbeiten eines Stapels oder
  in Anmelde- und Registrierungsformularen. Bis dahin steht oben «✨ Neue Version ist da – Jetzt laden».
- Gelegentlich blockiert der Browser den Wechsel, weil die alte Version noch eine Anfrage bearbeitet. Dann lädt die
  App nach 4 Sekunden trotzdem neu (höchstens einmal pro Minute, nur auf sicheren Seiten). Übernimmt die neue
  Version erst danach, merkt die App das am `index.html` des Service Workers (anderes Hauptskript) und lädt nochmals.
- Hängt die alte Version an einer Anfrage, die nicht fertig wird (z. B. schlechtes Mobilnetz), hilft auch das
  Neuladen nicht. Wartet die neue Version 8 Sekunden nach dem Neuladen immer noch, meldet die App die alte ab und
  lädt die neue direkt vom Server; die Offline-Kopie wird im Hintergrund neu eingerichtet. Nur online, auf sicheren
  Seiten und höchstens einmal pro Stunde. Nachgestellt mit einem Service Worker, der eine Anfrage nie beantwortet:
  vorher blieb die alte Version stehen, jetzt läuft nach rund 12 Sekunden die neue.
- Unter Konto gibt es «Nach Updates suchen».

### Synchronisation

Die Nutzerdaten (Spieleliste und Spielgruppen) werden **zuerst lokal** gespeichert (Zustand + `localStorage`)
und im Hintergrund mit dem Server abgeglichen ([`client/src/lib/sync.ts`](../client/src/lib/sync.ts)):

- Jeder Datensatz hat `updatedAt` und `deleted` (Löschungen bleiben 180 Tage als «Grabstein» erhalten,
  damit andere Geräte davon erfahren).
- Der Client sendet alle Datensätze an `POST /api/sync`. Der Server übernimmt pro Datensatz die **neuere Version**
  (*last write wins*) und antwortet mit dem zusammengeführten Stand. Der Client führt diesen mit der gleichen
  Regel ([`shared/sync.ts`](../shared/sync.ts)) in seinen lokalen Stand ein.
- Synchronisiert wird nach jeder Änderung (entprellt), beim Start, wenn das Gerät wieder online ist, wenn die App
  in den Vordergrund kommt und alle 5 Minuten.
- Zeitstempel aus der Zukunft (falsche Geräteuhr) werden vom Server auf «jetzt + 1 Minute» begrenzt.
- **Löschen mit «Rückgängig»** ([`store/undo.ts`](../client/src/store/undo.ts)): Stapel, Gruppen, Personen,
  Karten im Editor, Entwürfe und Spiele in «Meine Spiele» verschwinden sofort; der Hinweis bietet einige Sekunden
  lang «Rückgängig». Wiederherstellen schreibt einen neueren Zeitstempel (`restoreStack`, `restoreGroup`,
  `restorePlayer`), damit der Datensatz auch auf anderen Geräten zurückkommt. Stapel und Gruppen lassen sich in der
  Liste über «⋯» und auf ihrer Seite oben rechts löschen – nicht nur ganz unten.

Die Datenmengen sind klein (Gruppen mit Namen), deshalb wird immer der komplette Stand übertragen – das ist
einfach und robust.

Spieleinstellungen (z. B. Zünddauer), Ton und Vibration sind **Geräteeinstellungen** und werden nicht synchronisiert.

## Sicherheit

| Thema | Umsetzung |
| --- | --- |
| Passwörter | `scrypt` (N=2¹⁵, r=8, p=3, 16-Byte-Salt) aus `node:crypto`; Parameter werden mit dem Hash gespeichert und sind damit später erhöhbar |
| Sessions | Zufälliges 256-Bit-Token im Cookie `phonegames_session` (`HttpOnly`, `Secure`, `SameSite=Lax`); in der DB liegt nur der SHA-256-Hash. Gültig 180 Tage, verlängert sich bei Nutzung |
| CSRF | Ändernde API-Aufrufe brauchen den Header `X-Requested-With: phonegames`. Browser senden eigene Header nur bei Same-Origin-Anfragen (CORS ist nicht aktiviert) |
| Passkeys | WebAuthn mit [SimpleWebAuthn](https://simplewebauthn.dev): auffindbare Passkeys mit Pflicht zur Benutzerprüfung (Face ID, Fingerabdruck, PIN), keine Attestierung. Challenges sind einmalig und 5 Minuten gültig; Origin und RP-ID kommen aus `APP_ORIGIN`. In der DB liegt nur der öffentliche Schlüssel. Gelöschte Passkeys werden dem Gerät per Signal-API gemeldet, damit es sie vergisst |
| Einladungscodes | Vergleich in konstanter Zeit (SHA-256 + `timingSafeEqual`), geprüft **vor** der E-Mail-Prüfung – ohne gültigen Code lässt sich nicht herausfinden, ob ein Konto existiert |
| Brute Force | Rate-Limit auf Registrierung, Anmeldung, Passwort- und Kontoänderungen; konstante Antwortzeit bei unbekannten E-Mails |
| Passwortänderung | Meldet alle anderen Geräte ab. E-Mail-Änderung und Kontolöschung erfordern das aktuelle Passwort |
| HTTP-Header | Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS (Caddy) |
| Eingaben | Validierung aller Requests mit Zod (Längen, Formate, Anzahl Gruppen/Personen) |
| Container | Läuft als unprivilegierter Benutzer `node`; nur Caddy ist von aussen erreichbar |

### Datenschutz

Gespeichert werden nur Name, E-Mail, Passwort-Hash, Avatar, die Spieleliste, die Spielgruppen (Vornamen der
Mitspielenden), die Lernstapel und der Lernstand pro Person. Es gibt keine Tracker und keine externen Requests aus dem
Browser (Schriften sind eingebettet). Fotos für Lernstapel reicht der Server an die Infomaniak AI Tools weiter
(Rechenzentren in der Schweiz); sie werden weder gespeichert noch protokolliert, nur die erkannten Karten bleiben. Nutzer können
ihre Daten als JSON exportieren und ihr Konto samt allen Daten selbst löschen. Das Jahresabo läuft über Stripe:
Zahlungsdaten gibt man nur auf der Zahlungsseite und im Kundenportal von Stripe ein; der Server kennt nur die
Kunden- und Abo-Nummer bei Stripe, den Status und das Ablaufdatum.

**Rechtstexte:** Impressum, Nutzungsbedingungen (AGB) und Datenschutzerklärung sind öffentliche Seiten
(`/impressum`, `/agb`, `/datenschutz`, Texte in `client/src/legal/`), verlinkt auf der Startseite, bei Anmeldung,
Registrierung, Abo, Konto und geteilten Stapeln. Die Betreiberangaben stehen an einer Stelle:
`client/src/legal/operator.ts`. Bei der Registrierung stimmt man per Checkbox zu; der Server speichert Version
(`TERMS_VERSION` in `shared/legal.ts`) und Zeitpunkt. Konten ohne Zustimmung zur aktuellen Version – ältere Konten
oder nach einer Änderung der Texte – sehen vor allem anderen die Seite «Kurz zustimmen» (`/bedingungen`). Wer die
Texte ändert, setzt `TERMS_VERSION` und `TERMS_DATE` auf das neue Datum. Mit einem Infomaniak-VPS liegen
die Daten in der Schweiz.

## Datenmodell (SQLite)

| Tabelle | Inhalt |
| --- | --- |
| `users` | `id`, `email` (eindeutig, case-insensitive), `name`, `avatar`, `color`, `password_hash`, `passkey_hint_dismissed`, Zeitstempel |
| `passkeys` | `id` (Credential-ID), `user_id`, `public_key`, `counter`, `transports`, `device_type`, `backed_up`, `name`, `created_at`, `last_used_at` |
| `sessions` | `token_hash`, `user_id`, `expires_at`, `last_seen_at`, `user_agent` |
| `library` | `user_id`, `game_id`, `added_at`, `updated_at`, `deleted` |
| `player_groups` | `user_id`, `id`, `name`, `emoji`, `players` (JSON), `created_at`, `updated_at`, `deleted` |
| `learn_stacks` | `user_id`, `id`, `data` (JSON: Titel, Fach, Sprachen, Karten, empfohlene Spielformen, Quelle), `created_at`, `updated_at`, `deleted` |
| `learn_progress` | `user_id`, `id` (aus Stapel und Personenname abgeleitet), `stack_id`, `data` (JSON: Name, Fach und Fälligkeit pro Karte, Lerntage für die Lernserie), `updated_at`, `deleted` |
| `learn_usage` | `user_id`, `month` (Kalendermonat in der Schweiz, z. B. `2026-11`), `count` – für das Monatslimit der Foto-Auswertung |
| `learn_shares` | `id` (zufällig, 128 Bit), `owner_id`, `stack_id` (ein Link pro Stapel), `data` (JSON: Kopie der Karten ohne Lernstand), `imports`, `signups`, Zeitstempel |

Migrationen stehen in [`server/src/db.ts`](../server/src/db.ts) und laufen beim Start automatisch. Neue
Migrationen immer **anhängen**, nie bestehende ändern.

## API

Alle Antworten sind JSON. Fehler haben die Form `{ "error": "code", "message": "Deutscher Text" }`.
Ändernde Requests brauchen `X-Requested-With: phonegames`.

| Methode & Pfad | Auth | Body | Antwort |
| --- | --- | --- | --- |
| `GET /api/health` | – | – | `{ ok, version }` |
| `GET /api/tts?voice=thorsten&text=…` | ✅ | – | `audio/wav` (ein Satz, max. 300 Zeichen) · `503 tts_unavailable` |
| `GET /api/auth/options` | – | – | `{ inviteRequired, passkeys, tts, billing }` |
| `POST /api/auth/register` | – | `{ name, email, password, inviteCode?, shareId?, termsVersion? }` | `201 { user }` + Cookie – mit Code kostenlos (`plan: 'free'`), ohne Code mit Abo (`plan: 'paid'`, `access: false` bis zum Abo) · `403 invite_required` (ohne Stripe) / `invalid_invite` |
| `POST /api/auth/login` | – | `{ email, password }` | `{ user }` + Cookie |
| `POST /api/auth/logout` | – | – | `204` |
| `POST /api/passkeys/login/options` | – | – | WebAuthn-Optionen zum Anmelden |
| `POST /api/passkeys/login/verify` | – | `{ response }` | `{ user }` + Cookie · `404 unknown_passkey` |
| `GET /api/passkeys` | ✅ | – | `{ passkeys, userHandle }` |
| `POST /api/passkeys/register/options` | ✅ | – | WebAuthn-Optionen zum Einrichten |
| `POST /api/passkeys/register/verify` | ✅ | `{ response }` | `201 { passkey, user }` |
| `DELETE /api/passkeys/:id` | ✅ | – | `{ user, remaining }` |
| `GET /api/auth/me` | ✅ | – | `{ user }` – fragt Stripe, wenn das Abojahr abgelaufen ist |
| `POST /api/billing/checkout` | ✅ | – | `{ url }` der Zahlungsseite von Stripe (beim ersten Mal mit 7 Tagen gratis) · `409 free_plan` / `already_subscribed` |
| `POST /api/billing/confirm` | ✅ | `{ sessionId }` | `{ user, confirmed }` – nach der Zahlungsseite · `403 checkout_foreign` |
| `POST /api/billing/portal` | ✅ | – | `{ url }` des Kundenportals von Stripe · `409 no_subscription` |
| `POST /api/billing/refresh` | ✅ | – | `{ user }` – nach dem Kundenportal |
| `PATCH /api/account` | ✅ | `{ name?, avatar?, color?, email?, password?, passkeyHintDismissed? }` | `{ user }` |
| `POST /api/account/password` | ✅ | `{ currentPassword, newPassword }` | `204` |
| `POST /api/account/terms` | ✅ | `{ version }` | `{ user }` – Zustimmung zu Nutzungsbedingungen und Datenschutzerklärung (`shared/legal.ts`) |
| `DELETE /api/account` | ✅ | `{ password }` | `204` |
| `GET /api/account/export` | ✅ | – | JSON-Datei mit allen Daten |
| `POST /api/sync` | ✅ | `{ library, groups, stacks, progress }` (ältere Apps ohne `stacks`/`progress` gehen auch) | `{ library, groups, stacks, progress, serverTime }` |
| `GET /api/learn/usage` | ✅ | – | `{ available, used, limit, remaining, resetsOn, maxPhotos }` |
| `GET /api/shares/mine` | ✅ | – | `{ shares: LearnShareInfo[] }` |
| `POST /api/shares` | ✅ | `{ stackId, title, subject, languages, cards, suggestedModes }` | `{ share }` – legt den Link an oder aktualisiert die Karten dahinter |
| `DELETE /api/shares/:id` | ✅ | – | `204` – der Link funktioniert danach nicht mehr |
| `GET /api/shares/:id` | – | – | Vorschau `{ title, subject, cardCount, sample }` · `404 share_not_found` |
| `POST /api/shares/:id/import` | ✅ | – | `{ stack }` (Kopie der Karten) |
| `POST /api/learn/extract` | ✅ | `{ images: string[], mode?: 'exact' \| 'creative', count?: 5–30 }` (1–6 JPEG/PNG/WebP als Data-URL) | `{ draft, usage }` · `429 learn_limit` / `learn_running` · `422 learn_empty` · `502 learn_failed` · `503 learn_unavailable` / `learn_busy` |

Sync, Lernen, Teilen (anlegen, übernehmen) und die Erzählstimme brauchen zusätzlich ein laufendes Abo oder ein
kostenloses Konto, sonst `402 subscription_required`. Konto, Export und Löschen gehen immer.

Die Typen stehen in [`shared/types.ts`](../shared/types.ts).

## Konfiguration (Umgebungsvariablen des Servers)

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `PORT` | `3000` | Port der API |
| `HOST` | `127.0.0.1` (Prod: `0.0.0.0`) | Bind-Adresse |
| `DATA_DIR` | `./data` (Docker: `/data`) | Ordner der SQLite-Datenbank |
| `CLIENT_DIR` | `dist/client` | Gebaute PWA |
| `SERVE_CLIENT` | in Produktion `true` | PWA ausliefern |
| `COOKIE_SECURE` | in Produktion `true` | `Secure`-Flag für das Session-Cookie |
| `TRUST_PROXY` | in Produktion `true` | `X-Forwarded-*` von Caddy vertrauen (für Rate-Limit nach Client-IP) |
| `LOG_LEVEL` | `info` / `debug` | Fastify/Pino-Loglevel |
| `APP_VERSION` | `dev` | Wird im Health-Check und in der App angezeigt |
| `INVITE_CODES` | – | Einladungscodes, mit Komma getrennt. Ein Code gibt ein kostenloses Konto. Ohne Stripe: gesetzt = Registrierung nur mit Code; leer = offen |
| `STRIPE_SECRET_KEY` | – | Geheimer Stripe-Schlüssel für das Jahresabo (CHF 5, 7 Tage gratis). Ohne Schlüssel kein Abo |
| `STRIPE_API_URL` | `https://api.stripe.com` | Nur für Tests (Stripe-Attrappe) |
| `TTS_URL` | – | Piper-Dienst für die Erzählstimme (Docker: `http://tts:5000`). Ohne Wert gibt es nur Gerätestimmen |
| `APP_ORIGIN` | Dev: `http://localhost:5173,http://localhost:3000` | Öffentliche Adresse der App (Docker: `https://${APP_DOMAIN}`). Passkeys sind an diese Domain gebunden; ohne Wert sind sie in Produktion ausgeschaltet |
| `INFOMANIAK_AI_TOKEN` | – | API-Token der Infomaniak AI Tools für die Foto-Auswertung. Ohne Token ist sie ausgeschaltet (Abtippen geht weiterhin) |
| `INFOMANIAK_AI_PRODUCT_ID` | – | Produkt-ID der AI Tools (`GET /1/ai`) |
| `LEARN_AI_MODEL` | `Qwen/Qwen3.8-27B-FP8` | Modell mit Bildverständnis |
| `LEARN_MONTHLY_LIMIT` | `5` | Foto-Auswertungen pro Person und Kalendermonat |
| `LEARN_GLOBAL_MONTHLY_LIMIT` | `2000` | Notbremse: Auswertungen pro Monat über alle Konten |
| `LEARN_AI_URL` | `https://api.infomaniak.com` | Basis-URL der KI-Schnittstelle (für Tests) |

## Sound, Grafik & Haptik

- **Sounds** werden mit der Web Audio API synthetisiert ([`client/src/lib/audio.ts`](../client/src/lib/audio.ts),
  [`client/src/games/bombe/sounds.ts`](../client/src/games/bombe/sounds.ts)) – Ticken, Zündschnur-Knistern,
  Explosion mit Sub-Bass und Verzerrung. Es gibt keine Audiodateien. Auf iOS wird `navigator.audioSession` auf
  `playback` gesetzt, damit der Ton auch im Lautlos-Modus zu hören ist.
- **Audio bleibt wach:** Die Engine hängt sich an jede Berührung (`pointerup`, `touchend`, `click`, `keydown`) und
  startet oder weckt den Audio-Kontext dort – auch nachdem iOS ihn im Hintergrund pausiert hat. Beim ersten Start
  spielt sie einen stummen Puffer ab, den iOS zum «Aufwärmen» braucht.
- **Sound-Baukasten:** Neben `correct()`, `wrong()`, `buzzer()` usw. gibt es `tap()`, `flip()`, `pluck(i)`
  (pentatonische Töne, z. B. pro Finger), `swirl()`, `ding()`, `coin()`, `countTick()`, `sparkle()`, `fanfare()`,
  `fail()`, `sting()`, `gong()`, `birds()`, `tension()` sowie die Schleifen `drumroll()` und `heartbeat()`. Alle
  Töne liegen im Bereich, den Handy-Lautsprecher gut wiedergeben.
- **Timing:** Der Bomben-Timer plant Ticks mit dem präzisen Audio-Clock voraus («Two Clocks»-Prinzip), die Spielzeit
  selbst misst `performance.now()`. So bleibt das Ticken gleichmässig, auch wenn die Animation viel Rechenzeit braucht.
- **Explosion:** Canvas-Partikelsystem (Feuerball, Schockwellen, Funken mit Schweif, Trümmer, Rauch, Glut) plus
  Blitz, Screen-Shake und Comic-Schriftzug. Bei «Bewegung reduzieren» wird alles abgeschwächt.
- **Haptik:** Vibration (Android) beim Ticken in der heissen Phase, bei der Explosion, bei richtigen/falschen Antworten.
- **Wake Lock:** Der Bildschirm bleibt während des Spiels eingeschaltet.
- **Erzählstimme (Phonegames-Stimmen):** Natürliche neuronale Stimmen («Thorsten», «Kerstin») von
  [Piper](https://github.com/OHF-Voice/piper1-gpl) laufen in einem eigenen Container ([`tts/`](../tts)) auf dem
  Server. Die App fragt `GET /api/tts?voice=…&text=…` ab; der Server reicht an Piper weiter und speichert jeden
  fertigen Satz als WAV im Daten-Volume (`tts-cache/`, max. 500 MB). Im Browser werden die Sätze per Web Audio
  abgespielt und in der Cache Storage abgelegt – «Nachts im Dorf» lädt beim Rollenverteilen alle Ansagen (auch mit
  den Spielernamen) vor, damit es nachts ohne Wartezeit und später auch offline klingt. So klingt die Stimme auf
  jedem Gerät gleich, auch auf dem iPhone. Ist ein Satz nicht verfügbar (offline und nicht im Cache, Dienst
  gestört), liest ihn die beste Gerätestimme.
- **Gerätestimmen:** Ohne Phonegames-Stimme liest die Web Speech API vor
  ([`client/src/lib/speech.ts`](../client/src/lib/speech.ts)). Die Qualität hängt fast nur von der Stimme ab, deshalb
  werden die deutschen Stimmen des Geräts bewertet: natürliche/neuronale, Premium- und erweiterte Stimmen zuerst,
  Schweizer vor deutschen und österreichischen, alte Desktop-Stimmen zuletzt, Spassstimmen von iOS («Eddy»,
  «Grandma» …) nie. Gesprochen wird Satz für Satz mit kurzen Pausen; Ansagen werden nacheinander abgespielt. Fällt
  eine Online-Stimme aus (z. B. offline), springt die beste Stimme auf dem Gerät ein. Unter **Konto → Erzählstimme**
  und in den Spieleinstellungen lässt sich die Stimme mit Hörprobe wählen. **Einschränkung iPhone/iPad:** WebKit gibt
  Webseiten nur die vorinstallierten Stimmen frei; heruntergeladene Premium-/Enhanced-Stimmen sind Apps vorbehalten
  (gilt für alle Browser auf iOS). Ohne Sprachausgabe übernimmt eine Person die Spielleitung.
- **Bewegungssensor:** «Wer bin ich?» erkennt Nicken nach vorne/hinten über `deviceorientation`
  ([`client/src/lib/motion.ts`](../client/src/lib/motion.ts)). Die Neigung wird als vertikale Komponente der
  Display-Normalen berechnet (`cos β · cos γ`) und ist damit unabhängig von Hoch- oder Querformat. iOS fragt einmal
  um Erlaubnis; ohne Sensor wird per Tippen gesteuert.
- **Multi-Touch:** «Zufallsfinger» verfolgt bis zu zehn Finger gleichzeitig über Pointer Events.
- **Zeichenfläche:** «Zeichnen & Raten» speichert Striche als normalisierte Punkte und zeichnet sie mit Quadratkurven
  geglättet neu – so bleibt die Zeichnung bei Grössenänderungen erhalten.

## Lernstapel und Foto-Auswertung

«Lernen» (früher «Spickzettel») arbeitet mit **Lernstapeln** (Konzept: [KONZEPT-LERNSTAPEL.md](KONZEPT-LERNSTAPEL.md)).

- **Erfassen:** Die App verkleinert Fotos im Browser auf höchstens 2000 px (JPEG) und schickt bis zu 6 an
  `POST /api/learn/extract`. Der Server prüft Format und Magic Bytes, das Monatslimit pro Person und die globale
  Notbremse und ruft dann die OpenAI-kompatible Schnittstelle der Infomaniak AI Tools auf
  (`/2/ai/{product_id}/openai/v1/chat/completions`) – mit festem JSON-Schema (`response_format: json_schema`) und
  **ohne «Nachdenken»** (`reasoning_effort: "none"`; mit Denken verbraucht das Modell sonst die ganze Ausgabe dafür).
  Die Antwort wird nicht vertraut, sondern bereinigt ([`routes/learn.ts`](../server/src/routes/learn.ts), `toDraft`):
  leere und doppelte Karten fallen weg, falsche Antworten dürfen nicht der richtigen entsprechen, Längen werden
  begrenzt. Bei Fehlern wird einmal wiederholt; nur erfolgreiche Auswertungen zählen ans Limit.
  Zwei Arten (`mode`): `exact` übernimmt nur, was auf den Fotos steht (`systemPrompt('exact')`, Temperatur 0.2);
  `creative` erfindet `count` neue Karten zum erkannten Thema (Temperatur 0.7, `generated: true` im Entwurf). Erfundene
  Karten prüft ein zweiter, reiner Textaufruf (`checkCards`, Temperatur 0); beanstandete Karten bekommen
  `uncertain = «Möglicherweise falsch – …»` und sind in der Prüfansicht gelb. Fällt die Kontrolle aus, bleibt der
  Entwurf trotzdem gültig.
- **Prüfen:** Das Ergebnis ist ein Entwurf (`LearnDraft`), den die Person in der Prüfansicht korrigiert. Der Entwurf
  liegt bis zum Speichern im Browser (`phonegames-learn-draft`), damit eine Auswertung nicht verloren geht.
  Abtippen («le chien = der Hund», eine Zeile pro Karte) funktioniert ohne KI und offline
  ([`lib/learn.ts`](../client/src/lib/learn.ts), `parseTextCards`).
- **Speichern:** Stapel (`LearnStack`) und Lernstand (`LearnProgress`) werden wie Spielgruppen offline-first
  gespeichert und synchronisiert. Der Lernstand hat pro Stapel und Person eine feste ID (`progressId`), damit alle
  Geräte denselben Datensatz bearbeiten.
- **Kartenkasten:** Lernkartei mit 5 Fächern. Gewusst → ein Fach weiter (fällig nach 0, 1, 3, 7, 14 Tagen; im
  letzten Fach nach 30 Tagen), nicht gewusst → Fach 1 und in derselben Runde noch einmal. Fällig sind zuerst die
  Karten aus den vorderen Fächern, neue zuletzt.
- **Erinnerung:** Die Startseite zeigt fällige Karten (`LearnDue`): pro Person und Stapel die Karten mit Lernstand,
  deren Fälligkeit erreicht ist. Der Link `/spiel/spickzettel?stapel=…&modus=kasten` wählt Stapel und Spielform vor.
- **Antworten eintippen:** `checkTypedAnswer` vergleicht ohne Gross-/Kleinschreibung, Leer- und Satzzeichen; ein
  fehlender Akzent oder Artikel und ein kleiner Tippfehler (Damerau-Levenshtein, ab 5 Zeichen 1, ab 10 Zeichen 2)
  gelten als «fast richtig» und zählen.
- **Duell:** Zwei Personen, geteilter Bildschirm (die obere Hälfte ist um 180° gedreht). Antworten reagieren auf
  `pointerdown` statt `click`, damit beide gleichzeitig tippen können. Ein falscher Tipp sperrt die Seite kurz und
  setzt die Karte im Kartenkasten dieser Person zurück in Fach 1; richtige Antworten im Duell verschieben nichts,
  weil die Auswahl aus vier leichter ist als freies Antworten.
- **Schätzrunde:** Karten, deren Antwort eine Zahl ist (`cardNumber`: «1291», «4478 m», «ca. 8,7 Mio.»), werden
  geheim geschätzt (`PassTurns`). `estimateVerdict` bewertet Jahre absolut, andere Zahlen relativ; weit daneben
  setzt die Karte bei dieser Person zurück in Fach 1. Eingabe und Hochzählen teilen sich Schätzrunde und
  Schätzmeister (`shared/estimate.tsx`).
- **Lückentext:** Karten der Art `cloze` haben genau eine Lücke `___` im Satz (`shared/learn.ts`, `normalizeGap` –
  auf dem Server für die KI-Antwort, im Client für Abtippen und Prüfansicht). Die Spielform zeigt die Sätze in
  Textreihenfolge auf Seiten zu höchstens 5 Lücken, mit Wortbank (Antworten plus bis zu zwei falsche Wörter) oder
  Eingabefeldern (`checkTypedAnswer`). Fehler gehen in Fach 1.
- **Teilen:** Auf der Stapel-Seite erzeugt «Link teilen» eine Freigabe (`POST /api/shares`) mit zufälliger ID
  (`/s/<id>`) und öffnet das Teilen-Menü des Handys (sonst wird der Link kopiert). Der Server speichert eine Kopie
  der Karten, ohne Lernstand und ohne Namen. Die Vorschau sehen alle mit dem Link (Titel, Fach, Anzahl, drei
  Beispielkarten, `X-Robots-Tag: noindex`); übernehmen können nur angemeldete Personen – als eigene Kopie. Solange
  die Registrierung einen Einladungscode braucht, gilt der Link als Einladung, höchstens für 50 neue Konten
  (`LIMITS.shareSignups`). Nach Registrierung oder Anmeldung über den Link wird der Stapel gleich übernommen. Wer
  teilt, sieht, wie oft übernommen wurde, kann die geteilte Version aktualisieren und die Freigabe beenden.

