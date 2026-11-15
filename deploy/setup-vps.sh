#!/usr/bin/env bash
# One-time preparation of a fresh Infomaniak VPS (Ubuntu 24.04 / Debian 12+).
#
#   scp deploy/setup-vps.sh ubuntu@<server-ip>:~
#   ssh ubuntu@<server-ip> 'sudo DEPLOY_PUBKEY="ssh-ed25519 AAAA… github-deploy" bash setup-vps.sh'
#
# What it does:
#   1. installs security updates, Docker Engine + Compose plugin, ufw, fail2ban
#   2. creates the user "deploy" (member of the docker group) for GitHub Actions
#   3. creates the app directory /opt/plausch
#   4. opens only SSH, HTTP and HTTPS in the firewall
#   5. enables automatic security updates
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/plausch}"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-}"

if [[ $EUID -ne 0 ]]; then
  echo "Bitte mit sudo ausführen." >&2
  exit 1
fi

. /etc/os-release
echo "==> System: ${PRETTY_NAME}"

echo "==> Pakete aktualisieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker installieren (offizielles Repository)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Benutzer '${DEPLOY_USER}' einrichten"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
if [[ -n "${DEPLOY_PUBKEY}" ]] && ! grep -qF "${DEPLOY_PUBKEY}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"; then
  echo "${DEPLOY_PUBKEY}" >> "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi
chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"

echo "==> App-Verzeichnis ${APP_DIR}"
install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}"

echo "==> Firewall (ufw): SSH, HTTP, HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Automatische Sicherheitsupdates"
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

echo
echo "Fertig! Nächste Schritte:"
echo "  - Falls DEPLOY_PUBKEY leer war: Public Key in /home/${DEPLOY_USER}/.ssh/authorized_keys eintragen"
echo "  - Host-Key für GitHub (Secret VPS_KNOWN_HOSTS): ssh-keyscan -H <domain-oder-ip>"
echo "  - Im Infomaniak Manager ggf. die Ports 80/443 in der Firewall des VPS freigeben"
echo "  - Siehe docs/DEPLOYMENT.md"
