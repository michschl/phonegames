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

Bei einer neuen Version erscheint ein Hinweis «Eine neue Version ist bereit – Aktualisieren». So wird nie mitten
in einem Spiel neu geladen.

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

Gespeichert werden nur Name, E-Mail, Passwort-Hash, Avatar, die Spieleliste und die Spielgruppen (Vornamen der
Mitspielenden). Es gibt keine Tracker und keine externen Requests (Schriften sind eingebettet). Nutzer können
ihre Daten als JSON exportieren und ihr Konto samt allen Daten selbst löschen. Mit einem Infomaniak-VPS liegen
die Daten in der Schweiz.

## Datenmodell (SQLite)

| Tabelle | Inhalt |
| --- | --- |
| `users` | `id`, `email` (eindeutig, case-insensitive), `name`, `avatar`, `color`, `password_hash`, `passkey_hint_dismissed`, Zeitstempel |
| `passkeys` | `id` (Credential-ID), `user_id`, `public_key`, `counter`, `transports`, `device_type`, `backed_up`, `name`, `created_at`, `last_used_at` |
| `sessions` | `token_hash`, `user_id`, `expires_at`, `last_seen_at`, `user_agent` |
| `library` | `user_id`, `game_id`, `added_at`, `updated_at`, `deleted` |
| `player_groups` | `user_id`, `id`, `name`, `emoji`, `players` (JSON), `created_at`, `updated_at`, `deleted` |

Migrationen stehen in [`server/src/db.ts`](../server/src/db.ts) und laufen beim Start automatisch. Neue
Migrationen immer **anhängen**, nie bestehende ändern.

## API

Alle Antworten sind JSON. Fehler haben die Form `{ "error": "code", "message": "Deutscher Text" }`.
Ändernde Requests brauchen `X-Requested-With: phonegames`.

| Methode & Pfad | Auth | Body | Antwort |
| --- | --- | --- | --- |
| `GET /api/health` | – | – | `{ ok, version }` |
| `GET /api/tts?voice=thorsten&text=…` | ✅ | – | `audio/wav` (ein Satz, max. 300 Zeichen) · `503 tts_unavailable` |
| `GET /api/auth/options` | – | – | `{ inviteRequired }` |
| `POST /api/auth/register` | – | `{ name, email, password, inviteCode? }` | `201 { user }` + Cookie · `403 invite_required` / `invalid_invite` |
| `POST /api/auth/login` | – | `{ email, password }` | `{ user }` + Cookie |
| `POST /api/auth/logout` | – | – | `204` |
| `POST /api/passkeys/login/options` | – | – | WebAuthn-Optionen zum Anmelden |
| `POST /api/passkeys/login/verify` | – | `{ response }` | `{ user }` + Cookie · `404 unknown_passkey` |
| `GET /api/passkeys` | ✅ | – | `{ passkeys, userHandle }` |
| `POST /api/passkeys/register/options` | ✅ | – | WebAuthn-Optionen zum Einrichten |
| `POST /api/passkeys/register/verify` | ✅ | `{ response }` | `201 { passkey, user }` |
| `DELETE /api/passkeys/:id` | ✅ | – | `{ user, remaining }` |
| `GET /api/auth/me` | ✅ | – | `{ user }` |
| `PATCH /api/account` | ✅ | `{ name?, avatar?, color?, email?, password?, passkeyHintDismissed? }` | `{ user }` |
| `POST /api/account/password` | ✅ | `{ currentPassword, newPassword }` | `204` |
| `DELETE /api/account` | ✅ | `{ password }` | `204` |
| `GET /api/account/export` | ✅ | – | JSON-Datei mit allen Daten |
| `POST /api/sync` | ✅ | `{ library: LibraryItem[], groups: PlayerGroup[] }` | `{ library, groups, serverTime }` |

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
| `INVITE_CODES` | – | Einladungscodes, mit Komma getrennt. Gesetzt = Registrierung nur mit Code; leer = offen |
| `TTS_URL` | – | Piper-Dienst für die Erzählstimme (Docker: `http://tts:5000`). Ohne Wert gibt es nur Gerätestimmen |
| `APP_ORIGIN` | Dev: `http://localhost:5173,http://localhost:3000` | Öffentliche Adresse der App (Docker: `https://${APP_DOMAIN}`). Passkeys sind an diese Domain gebunden; ohne Wert sind sie in Produktion ausgeschaltet |

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
