#!/usr/bin/env bash
# Richtet den Host ein (idempotent). Voraussetzung: Docker ist installiert.
# Aufruf als root aus dem ausgerollten Ordner: ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

[ -e /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap -q /swapfile; }
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab

if ! cmp -s host/daemon.json /etc/docker/daemon.json; then
  install -m 644 host/daemon.json /etc/docker/daemon.json
  systemctl restart docker
fi

install -d -m 711 /srv/devbox /srv/devbox/users
install -m 755 bin/devbox /usr/local/sbin/devbox
install -m 755 host/devbox-firewall.sh /usr/local/sbin/devbox-firewall

# Admin-SSH erst haerten, wenn die Konfiguration nachweislich gueltig ist.
install -m 644 host/10-hardening.conf /etc/ssh/sshd_config.d/10-hardening.conf
sshd -t
systemctl reload ssh

ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw --force enable >/dev/null
apt-get install -y -qq jq git gh >/dev/null
systemctl enable --now fail2ban >/dev/null

install -m 644 host/devbox-firewall.service /etc/systemd/system/devbox-firewall.service
systemctl daemon-reload
systemctl enable devbox-firewall >/dev/null
systemctl restart devbox-firewall

# Skills: oeffentlicher Klon ohne Zugangsdaten, stuendlich aktualisiert.
BRANCH=${BH_SKILLS_BRANCH:-main}
[ -d /opt/bh-skill-library/.git ] || git clone -q -b "$BRANCH" https://github.com/citysurfer2010/bh-skill-library.git /opt/bh-skill-library
install -m 644 host/bh-skills-sync.service host/bh-skills-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bh-skills-sync.timer >/dev/null

docker build -q -t devbox:current image
echo "Einrichtung fertig"
