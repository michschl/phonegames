# Deployment auf einen Infomaniak-VPS

Diese Anleitung bringt Phonegames auf einen VPS bei [Infomaniak](https://www.infomaniak.com) (VPS Cloud oder VPS Lite).
Nach der einmaligen Einrichtung wird **jeder Push auf `main` automatisch ausgerollt**.

## Überblick

```
 git push main
      │
      ▼
 GitHub Actions ──────────────────────────────────────────────────────────────┐
 │ 1. CI: Typecheck, Tests, Build                                             │
 │ 2. Docker-Image bauen → ghcr.io/<owner>/<repo>:<commit-sha>  (+ :latest)   │
 │    Stimmen-Image <repo>-tts nur, wenn sich der Ordner tts/ geändert hat    │
 │ 3. SSH auf den VPS: docker-compose.yml, Caddyfile, .env kopieren           │
 │    → docker compose pull && docker compose up -d --wait                    │
 │ 4. Health-Check https://<domain>/api/health                                │
 └────────────────────────────────────────────────────────────────────────────┘
      │
      ▼
 Infomaniak VPS (Ubuntu 24.04, Docker)
 ┌──────────────────────────────────────────────┐
 │  caddy  :80/:443  ── HTTPS (Let’s Encrypt)   │
 │    │                                         │
 │    └──► app :3000  (Fastify: API + PWA)      │
 │          ├── Volume app-data → phonegames.db │
 │          └──► tts :5000 (Piper-Erzählstimme) │
 └──────────────────────────────────────────────┘
```

- Die Container-Images liegen in der **GitHub Container Registry (GHCR)**. Der VPS braucht keinen Zugriff auf den
  Quellcode und keine dauerhaften GitHub-Zugangsdaten: Beim Deploy meldet sich der VPS mit dem kurzlebigen Token
  des Workflows an und meldet sich danach wieder ab.
- **Caddy** besorgt und erneuert das TLS-Zertifikat automatisch. HTTPS ist Pflicht, sonst funktioniert der
  Service Worker (Offline-Modus) nicht.
- Die Datenbank (SQLite) liegt im Docker-Volume `phonegames_app-data` und überlebt Updates.

## Voraussetzungen

- Infomaniak **VPS Cloud** oder **VPS Lite** – die kleinste Variante (1–2 vCPU, 2 GB RAM) reicht gut.
- Eine **Domain** oder Subdomain, z. B. `phonegames.example.ch`.
- Zugriff auf die **Einstellungen des GitHub-Repositorys** (Secrets & Variables).

## 1. VPS bestellen

1. Im [Infomaniak Manager](https://manager.infomaniak.com) einen VPS bestellen.
2. Als Betriebssystem **Ubuntu 24.04 LTS** wählen (Debian 12/13 funktioniert ebenfalls).
3. Deinen **persönlichen SSH-Public-Key** hinterlegen. Bei Ubuntu-Images heisst der Standardbenutzer `ubuntu`.
4. Im Manager die **Firewall des VPS** prüfen und eingehend freigeben:
   - TCP **22** (SSH)
   - TCP **80** (HTTP – nötig für die Zertifikatsausstellung)
   - TCP **443** und UDP **443** (HTTPS / HTTP/3)
5. Die **öffentliche IP-Adresse** notieren.

Test:

```bash
ssh ubuntu@<IP-ADRESSE>
```

## 2. DNS einrichten

Beim DNS-Anbieter der Domain (z. B. Infomaniak → Domain → DNS-Zone):

| Typ | Name | Wert |
| --- | --- | --- |
| A | `phonegames` (oder `@`) | IPv4-Adresse des VPS |
| AAAA | `phonegames` (oder `@`) | IPv6-Adresse des VPS (falls vorhanden) |

Prüfen (kann einige Minuten dauern):

```bash
dig +short phonegames.example.ch
```

## 3. Deploy-Schlüssel erzeugen

GitHub Actions verbindet sich mit einem eigenen SSH-Schlüssel – nicht mit deinem persönlichen. Auf deinem Rechner:

```bash
ssh-keygen -t ed25519 -C "github-deploy-phonegames" -f ./phonegames_deploy -N ""
```

Das erzeugt `phonegames_deploy` (privat → kommt in GitHub) und `phonegames_deploy.pub` (öffentlich → kommt auf den VPS).

## 4. VPS vorbereiten

Das Skript [`deploy/setup-vps.sh`](../deploy/setup-vps.sh) installiert Docker, legt den Benutzer `deploy` an,
erstellt `/opt/phonegames`, aktiviert die Firewall (`ufw`), `fail2ban` und automatische Sicherheitsupdates.

```bash
scp deploy/setup-vps.sh ubuntu@<IP-ADRESSE>:~
```

```bash
ssh ubuntu@<IP-ADRESSE> "sudo DEPLOY_PUBKEY='$(cat phonegames_deploy.pub)' bash setup-vps.sh"
```

Den Host-Key des Servers für GitHub auslesen (schützt vor Man-in-the-Middle-Angriffen):

```bash
ssh-keyscan -H <IP-ADRESSE-ODER-DOMAIN>
```

Prüfen, ob der Deploy-Benutzer Docker verwenden darf:

```bash
ssh -i phonegames_deploy deploy@<IP-ADRESSE> docker ps
```

## 5. GitHub konfigurieren

Im Repository unter **Settings → Environments** ein Environment namens **`production`** anlegen
(optional: «Required reviewers», damit jedes Deployment bestätigt werden muss).

### Variables (Repository-Variablen)

Unter **Settings → Secrets and variables → Actions → Tab «Variables» → «New repository variable»**.
Wichtig: als *Repository*-Variablen anlegen, nicht nur im Environment – GitHub wertet `VPS_HOST` aus, bevor das
Environment geladen ist.

| Name | Pflicht | Beispiel | Beschreibung |
| --- | --- | --- | --- |
| `VPS_HOST` | ✅ | `phonegames.example.ch` oder IP | Ohne diese Variable wird der Deploy-Schritt übersprungen |
| `APP_DOMAIN` | ✅ | `phonegames.example.ch` | Domain, für die Caddy das Zertifikat holt |
| `VPS_USER` | – | `deploy` | Standard: `deploy` |
| `VPS_PORT` | – | `22` | Standard: `22` |
| `APP_DIR` | – | `/opt/phonegames` | Standard: `/opt/phonegames` |

### Secrets (im Environment `production`)

Unter **Settings → Environments → production → «Add environment secret»** (Repository-Secrets funktionieren auch):

| Name | Pflicht | Inhalt |
| --- | --- | --- |
| `VPS_SSH_KEY` | ✅ | Kompletter Inhalt von `phonegames_deploy` (privater Schlüssel, inkl. `-----BEGIN …` / `-----END …`) |
| `VPS_KNOWN_HOSTS` | empfohlen | Ausgabe von `ssh-keyscan -H <host>` aus Schritt 4 |
| `INVITE_CODES` | empfohlen | Einladungscodes für die Registrierung, mit Komma getrennt, z. B. `PARTY-2026,FAMILIE`. Nicht gesetzt = jede und jeder kann sich registrieren |

Mit der GitHub-CLI geht das auch so:

```bash
gh secret set VPS_SSH_KEY --env production < phonegames_deploy
```

```bash
ssh-keyscan -H phonegames.example.ch | gh secret set VPS_KNOWN_HOSTS --env production
```

```bash
gh secret set INVITE_CODES --env production --body "PARTY-2026,FAMILIE"
```

```bash
gh variable set VPS_HOST --body "phonegames.example.ch"
```

```bash
gh variable set APP_DOMAIN --body "phonegames.example.ch"
```

> 💡 Danach den privaten Schlüssel `phonegames_deploy` lokal löschen oder sicher aufbewahren.

## 6. Erstes Deployment

- Änderungen nach `main` mergen **oder**
- in GitHub unter **Actions → Deploy → Run workflow** manuell starten.

Der Workflow ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) zeigt am Ende
`✅ https://phonegames.example.ch läuft`. Beim allerersten Start holt Caddy das Zertifikat – das dauert einige Sekunden.

## Betrieb

Alle Befehle auf dem VPS als Benutzer `deploy` im Verzeichnis `/opt/phonegames`.

| Aufgabe | Befehl |
| --- | --- |
| Status | `docker compose ps` |
| Logs (live) | `docker compose logs -f app` |
| Neustart | `docker compose restart app` |
| Stoppen | `docker compose down` (Daten bleiben im Volume) |

### Backups

[`deploy/backup.sh`](../deploy/backup.sh) erstellt im laufenden Betrieb eine konsistente Kopie der Datenbank
(`VACUUM INTO`) nach `/opt/phonegames/backups/` und löscht Backups, die älter als 14 Tage sind.
Täglich um 03:15 Uhr per Cron (`crontab -e` als `deploy`):

```
15 3 * * * /opt/phonegames/backup.sh >> /opt/phonegames/backups/backup.log 2>&1
```

Für echte Ausfallsicherheit die Backups zusätzlich ausser Haus kopieren, z. B. auf
Infomaniak **Swiss Backup** oder **kDrive** (per `rclone`).

Wiederherstellen:

```bash
docker compose stop app
```

```bash
gunzip -c backups/phonegames-JJJJMMTT-HHMMSS.db.gz > /tmp/phonegames.db
```

```bash
docker compose run --rm --no-deps -v /tmp/phonegames.db:/restore.db:ro --entrypoint sh app \
  -c 'cp /restore.db /data/phonegames.db && rm -f /data/phonegames.db-wal /data/phonegames.db-shm'
```

```bash
docker compose start app
```

(`docker compose run` läuft als Benutzer `node`, damit die App die Datei danach wieder beschreiben darf.)

### Erzählstimme

Die natürliche Erzählstimme läuft im Container `tts` ([Piper](https://github.com/OHF-Voice/piper1-gpl), GPL-3.0) mit
zwei deutschen Stimmen («Thorsten», «Kerstin», beide auf CC0-Daten trainiert). Das Image enthält die Stimmmodelle
(rund 170 MB, mit Prüfsumme geprüft) und wird nur neu gebaut, wenn sich der Ordner [`tts/`](../tts) ändert. Der
Dienst ist von aussen nicht erreichbar; die App ruft ihn auf und speichert jeden Satz im Volume (`tts-cache/`,
max. 500 MB). Er braucht rund 400 MB Arbeitsspeicher (Limit 1 GB). Fällt er aus, lesen die Geräte selbst vor.

### Passkeys

Passkeys (Anmelden mit Face ID, Fingerabdruck oder Geräte-PIN) funktionieren ohne weitere Einrichtung:
`docker-compose.yml` setzt `APP_ORIGIN` automatisch auf `https://<APP_DOMAIN>`. Passkeys sind fest an diese
Domain gebunden – wechselt die Domain, müssen alle ihre Passkeys neu einrichten (Anmelden mit Passwort geht
weiterhin).

### Einladungscodes

Solange das Secret `INVITE_CODES` gesetzt ist, braucht die Registrierung einen dieser Codes. Gross-/Kleinschreibung
und Leerzeichen spielen keine Rolle; erlaubt sind Buchstaben, Ziffern, `-` und `_`. Bestehende Konten melden sich
ganz normal an.

- **Einladen:** Code weitergeben oder direkt einen Link schicken – das Feld ist dann schon ausgefüllt:
  `https://phonegames.example.ch/registrieren?code=PARTY-2026`
- **Codes ändern:** Secret anpassen und neu ausrollen (**Actions → Deploy → Run workflow**). Ein entfernter Code
  funktioniert sofort nicht mehr.
- **Registrierung für alle öffnen:** Secret löschen und neu ausrollen. Das Feld verschwindet dann aus dem Formular.

Wähle Codes, die man nicht leicht errät. Die Registrierung ist zusätzlich auf 20 Versuche pro 15 Minuten und
IP-Adresse begrenzt.

### Rollback

Jedes Image ist mit dem Commit-SHA getaggt. Unter **Actions → Deploy → Run workflow** im Feld
«Image-Tag für ein Rollback» den gewünschten Commit-SHA eintragen – es wird nichts neu gebaut, nur ausgerollt.

### Updates des Servers

Sicherheitsupdates installiert `unattended-upgrades` automatisch. Gelegentlich einen Neustart einplanen:

```bash
sudo apt-get update && sudo apt-get -y upgrade && sudo reboot
```

Die Container starten dank `restart: unless-stopped` automatisch wieder.

## Fehlersuche

| Symptom | Ursache / Lösung |
| --- | --- |
| Deploy-Job wird übersprungen | Repository-Variable `VPS_HOST` fehlt (nur im Environment gesetzt reicht nicht) |
| `Permission denied (publickey)` | `VPS_SSH_KEY` unvollständig kopiert oder Public Key fehlt in `/home/deploy/.ssh/authorized_keys` |
| `Host key verification failed` | `VPS_KNOWN_HOSTS` passt nicht (z. B. VPS neu installiert) → neu mit `ssh-keyscan -H` erzeugen |
| `/opt/phonegames fehlt … oder ist nicht beschreibbar` | Ordner wurde nicht von `setup-vps.sh` angelegt. Einmalig auf dem VPS: `sudo install -d -m 750 -o deploy -g deploy /opt/phonegames` |
| `port is already allocated` | Ein anderer Container belegt Port 80/443. Mit `docker ps` prüfen und den alten Stack stoppen |
| `denied` beim `docker compose pull` | Workflow-Berechtigung `packages: write` fehlt oder Package gehört zu einem anderen Repo. Unter GitHub → Packages → *Package settings* das Repository verknüpfen |
| Kein Zertifikat / Browser-Warnung | DNS zeigt noch nicht auf den VPS oder Port 80/443 ist in der Infomaniak-Firewall bzw. `ufw` gesperrt. `docker compose logs caddy` prüfen |
| `502 Bad Gateway` | App-Container läuft nicht: `docker compose logs app` |
| Offline-Modus funktioniert nicht | Nur über HTTPS möglich; nach einem Update die App einmal neu laden |

## Manuelles Deployment (ohne GitHub Actions)

Image lokal bauen und direkt auf den VPS übertragen:

```bash
docker build -t phonegames:manual .
```

```bash
docker save phonegames:manual | ssh deploy@<host> docker load
```

Für die Erzählstimme ebenso das Stimmen-Image bauen und übertragen:

```bash
docker build -t phonegames-tts:manual tts
```

```bash
docker save phonegames-tts:manual | ssh deploy@<host> docker load
```

Auf dem VPS in `/opt/phonegames` die Dateien aus `deploy/` ablegen, `.env` nach Vorlage
[`deploy/.env.example`](../deploy/.env.example) anlegen (`APP_IMAGE=phonegames:manual`,
`TTS_IMAGE=phonegames-tts:manual`) und starten:

```bash
docker compose up -d
```
