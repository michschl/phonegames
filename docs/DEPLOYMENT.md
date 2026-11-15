# Deployment auf einen Infomaniak-VPS

Diese Anleitung bringt Plausch auf einen VPS bei [Infomaniak](https://www.infomaniak.com) (VPS Cloud oder VPS Lite).
Nach der einmaligen Einrichtung wird **jeder Push auf `main` automatisch ausgerollt**.

## Überblick

```
 git push main
      │
      ▼
 GitHub Actions ─────────────────────────────────────────────────────────────┐
 │ 1. CI: Typecheck, Tests, Build                                             │
 │ 2. Docker-Image bauen → ghcr.io/<owner>/<repo>:<commit-sha>  (+ :latest)  │
 │ 3. SSH auf den VPS: docker-compose.yml, Caddyfile, .env kopieren           │
 │    → docker compose pull && docker compose up -d --wait                    │
 │ 4. Health-Check https://<domain>/api/health                                │
 └────────────────────────────────────────────────────────────────────────────┘
      │
      ▼
 Infomaniak VPS (Ubuntu 24.04, Docker)
 ┌──────────────────────────────────────────────┐
 │  caddy  :80/:443  ── HTTPS (Let’s Encrypt)   │
 │    │                                          │
 │    └──► app :3000  (Fastify: API + PWA)       │
 │            └── Volume app-data → plausch.db   │
 └──────────────────────────────────────────────┘
```

- Die Container-Images liegen in der **GitHub Container Registry (GHCR)**. Der VPS braucht keinen Zugriff auf den
  Quellcode und keine dauerhaften GitHub-Zugangsdaten: Beim Deploy meldet sich der VPS mit dem kurzlebigen Token
  des Workflows an und meldet sich danach wieder ab.
- **Caddy** besorgt und erneuert das TLS-Zertifikat automatisch. HTTPS ist Pflicht, sonst funktioniert der
  Service Worker (Offline-Modus) nicht.
- Die Datenbank (SQLite) liegt im Docker-Volume `plausch_app-data` und überlebt Updates.

## Voraussetzungen

- Infomaniak **VPS Cloud** oder **VPS Lite** – die kleinste Variante (1–2 vCPU, 2 GB RAM) reicht gut.
- Eine **Domain** oder Subdomain, z. B. `plausch.example.ch`.
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
| A | `plausch` (oder `@`) | IPv4-Adresse des VPS |
| AAAA | `plausch` (oder `@`) | IPv6-Adresse des VPS (falls vorhanden) |

Prüfen (kann einige Minuten dauern):

```bash
dig +short plausch.example.ch
```

## 3. Deploy-Schlüssel erzeugen

GitHub Actions verbindet sich mit einem eigenen SSH-Schlüssel – nicht mit deinem persönlichen. Auf deinem Rechner:

```bash
ssh-keygen -t ed25519 -C "github-deploy-plausch" -f ./plausch_deploy -N ""
```

Das erzeugt `plausch_deploy` (privat → kommt in GitHub) und `plausch_deploy.pub` (öffentlich → kommt auf den VPS).

## 4. VPS vorbereiten

Das Skript [`deploy/setup-vps.sh`](../deploy/setup-vps.sh) installiert Docker, legt den Benutzer `deploy` an,
erstellt `/opt/plausch`, aktiviert die Firewall (`ufw`), `fail2ban` und automatische Sicherheitsupdates.

```bash
scp deploy/setup-vps.sh ubuntu@<IP-ADRESSE>:~
```

```bash
ssh ubuntu@<IP-ADRESSE> "sudo DEPLOY_PUBKEY='$(cat plausch_deploy.pub)' bash setup-vps.sh"
```

Den Host-Key des Servers für GitHub auslesen (schützt vor Man-in-the-Middle-Angriffen):

```bash
ssh-keyscan -H <IP-ADRESSE-ODER-DOMAIN>
```

Prüfen, ob der Deploy-Benutzer Docker verwenden darf:

```bash
ssh -i plausch_deploy deploy@<IP-ADRESSE> docker ps
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
| `VPS_HOST` | ✅ | `plausch.example.ch` oder IP | Ohne diese Variable wird der Deploy-Schritt übersprungen |
| `APP_DOMAIN` | ✅ | `plausch.example.ch` | Domain, für die Caddy das Zertifikat holt |
| `VPS_USER` | – | `deploy` | Standard: `deploy` |
| `VPS_PORT` | – | `22` | Standard: `22` |
| `APP_DIR` | – | `/opt/plausch` | Standard: `/opt/plausch` |

### Secrets (im Environment `production`)

Unter **Settings → Environments → production → «Add environment secret»** (Repository-Secrets funktionieren auch):

| Name | Pflicht | Inhalt |
| --- | --- | --- |
| `VPS_SSH_KEY` | ✅ | Kompletter Inhalt von `plausch_deploy` (privater Schlüssel, inkl. `-----BEGIN …` / `-----END …`) |
| `VPS_KNOWN_HOSTS` | empfohlen | Ausgabe von `ssh-keyscan -H <host>` aus Schritt 4 |

Mit der GitHub-CLI geht das auch so:

```bash
gh secret set VPS_SSH_KEY --env production < plausch_deploy
```

```bash
ssh-keyscan -H plausch.example.ch | gh secret set VPS_KNOWN_HOSTS --env production
```

```bash
gh variable set VPS_HOST --body "plausch.example.ch"
```

```bash
gh variable set APP_DOMAIN --body "plausch.example.ch"
```

> 💡 Danach den privaten Schlüssel `plausch_deploy` lokal löschen oder sicher aufbewahren.

## 6. Erstes Deployment

- Änderungen nach `main` mergen **oder**
- in GitHub unter **Actions → Deploy → Run workflow** manuell starten.

Der Workflow ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) zeigt am Ende
`✅ https://plausch.example.ch läuft`. Beim allerersten Start holt Caddy das Zertifikat – das dauert einige Sekunden.

## Betrieb

Alle Befehle auf dem VPS als Benutzer `deploy` im Verzeichnis `/opt/plausch`.

| Aufgabe | Befehl |
| --- | --- |
| Status | `docker compose ps` |
| Logs (live) | `docker compose logs -f app` |
| Neustart | `docker compose restart app` |
| Stoppen | `docker compose down` (Daten bleiben im Volume) |

### Backups

[`deploy/backup.sh`](../deploy/backup.sh) erstellt im laufenden Betrieb eine konsistente Kopie der Datenbank
(`VACUUM INTO`) nach `/opt/plausch/backups/` und löscht Backups, die älter als 14 Tage sind.
Täglich um 03:15 Uhr per Cron (`crontab -e` als `deploy`):

```
15 3 * * * /opt/plausch/backup.sh >> /opt/plausch/backups/backup.log 2>&1
```

Für echte Ausfallsicherheit die Backups zusätzlich ausser Haus kopieren, z. B. auf
Infomaniak **Swiss Backup** oder **kDrive** (per `rclone`).

Wiederherstellen:

```bash
docker compose stop app
```

```bash
gunzip -c backups/plausch-JJJJMMTT-HHMMSS.db.gz > /tmp/plausch.db
```

```bash
docker compose run --rm --no-deps -v /tmp/plausch.db:/restore.db:ro --entrypoint sh app \
  -c 'cp /restore.db /data/plausch.db && rm -f /data/plausch.db-wal /data/plausch.db-shm'
```

```bash
docker compose start app
```

(`docker compose run` läuft als Benutzer `node`, damit die App die Datei danach wieder beschreiben darf.)

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
| `denied` beim `docker compose pull` | Workflow-Berechtigung `packages: write` fehlt oder Package gehört zu einem anderen Repo. Unter GitHub → Packages → *Package settings* das Repository verknüpfen |
| Kein Zertifikat / Browser-Warnung | DNS zeigt noch nicht auf den VPS oder Port 80/443 ist in der Infomaniak-Firewall bzw. `ufw` gesperrt. `docker compose logs caddy` prüfen |
| `502 Bad Gateway` | App-Container läuft nicht: `docker compose logs app` |
| Offline-Modus funktioniert nicht | Nur über HTTPS möglich; nach einem Update die App einmal neu laden |

## Manuelles Deployment (ohne GitHub Actions)

Image lokal bauen und direkt auf den VPS übertragen:

```bash
docker build -t plausch:manual .
```

```bash
docker save plausch:manual | ssh deploy@<host> docker load
```

Auf dem VPS in `/opt/plausch` die Dateien aus `deploy/` ablegen, `.env` nach Vorlage
[`deploy/.env.example`](../deploy/.env.example) anlegen (`APP_IMAGE=plausch:manual`) und starten:

```bash
docker compose up -d
```
