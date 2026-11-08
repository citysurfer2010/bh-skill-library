#!/usr/bin/env bash
# Verbindet den Host per WireGuard mit dem Heimnetz (idempotent). Werte aus /srv/bh-platform/.env:
#   BH_WG_FRITZ_B64  komplette Fritzbox-Konfiguration, base64
#   BH_NAS_IP, BH_BEAMER_IP  einzige Ziele im Tunnel; ohne Werte wird nichts geroutet
# Nur der Host nutzt den Tunnel: die Firewall sperrt private Netze fuer alle Container.
set -euo pipefail
ENV=/srv/bh-platform/.env; CONF=/etc/wireguard/wg-fritz.conf
val() { sed -n "s/^$1=//p" "$ENV" | tail -1; }
b64=$(val BH_WG_FRITZ_B64); nas=$(val BH_NAS_IP); beamer=$(val BH_BEAMER_IP)
[ -n "$b64" ] || { echo "BH_WG_FRITZ_B64 fehlt" >&2; exit 1; }
targets=""
for ip in $nas $beamer; do
  [[ $ip =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "Ziel ungueltig: $ip" >&2; exit 1; }
  targets="${targets:+$targets,}$ip/32"
done
command -v wg-quick >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 install -y -qq --no-install-recommends wireguard-tools >/dev/null
umask 077
# 0.0.0.0/0 aus der Fritzbox-Datei wuerde den gesamten Serververkehr umleiten, DNS die Namensaufloesung.
base64 -d <<<"$b64" | tr -d '\r' | awk -v targets="$targets" '
  /^[[:space:]]*DNS[[:space:]]*=/ { next }
  /^[[:space:]]*AllowedIPs[[:space:]]*=/ { if (targets != "") print "AllowedIPs = " targets; next }
  /^[[:space:]]*Address[[:space:]]*=/ { sub(/\/[0-9]+/, "/32"); print; next }
  { print }' >"$CONF.new"
grep -q '^PrivateKey' "$CONF.new" && grep -q '^Endpoint' "$CONF.new" || { rm -f "$CONF.new"; echo "Konfiguration unvollstaendig" >&2; exit 1; }
mv "$CONF.new" "$CONF"
cat >/usr/local/sbin/wg-fritz-reresolve <<'S'
#!/usr/bin/env bash
# Die Heim-IP wechselt: Gegenstelle regelmaessig neu aufloesen.
conf=/etc/wireguard/wg-fritz.conf
wg set wg-fritz peer "$(sed -n 's/^PublicKey = //p' "$conf")" endpoint "$(sed -n 's/^Endpoint = //p' "$conf")"
S
chmod 700 /usr/local/sbin/wg-fritz-reresolve
cat >/etc/systemd/system/wg-fritz-reresolve.service <<'S'
[Unit]
Description=WireGuard-Gegenstelle neu aufloesen
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/wg-fritz-reresolve
S
cat >/etc/systemd/system/wg-fritz-reresolve.timer <<'S'
[Unit]
Description=WireGuard-Gegenstelle alle 5 Minuten neu aufloesen
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
S
systemctl daemon-reload
systemctl enable wg-quick@wg-fritz wg-fritz-reresolve.timer >/dev/null 2>&1
systemctl restart wg-quick@wg-fritz
systemctl start wg-fritz-reresolve.timer
echo "Tunnel aktiv; Ziele: ${targets:-keine}"
