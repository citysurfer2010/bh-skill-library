#!/usr/bin/env bash
# Richtet Web-Terminal, automatischen Aufbau und Subdomains ein (idempotent). Nur root auf dem VPS.
#   setup.sh [email=name ...]   Bestehende Umgebungen ihren Usern zuordnen
set -euo pipefail
R=/opt/bh-skill-library; W=$R/skills/bh-workspace; A=$R/apps/terminal
S=/srv/bh-terminal; U=101000; ENV=/srv/bh-platform/.env; EDGE=/srv/edge/conf/apps
val() { sed -n "s/^$1=//p" "$ENV" | head -1; }
install -d -m 711 "$S"; install -d -m 755 "$S/state" "$S/state/status" "$S/state/hostkeys"
install -d -m 700 -o "$U" -g "$U" "$S/ssh" "$S/data"
[ -f "$S/ssh/id_ed25519" ] || { ssh-keygen -q -t ed25519 -N '' -C bh-terminal -f "$S/ssh/id_ed25519"; chown "$U:$U" "$S/ssh/id_ed25519"*; chmod 400 "$S/ssh/id_ed25519"; }
[ -n "$(val BH_TERMINAL_EDGE_SECRET)" ] || (umask 077; echo "BH_TERMINAL_EDGE_SECRET=$(openssl rand -hex 32)" >>"$ENV")
domain=$(val EDGE_DOMAIN)
grep -q '^BH_RETURN_ORIGINS=https://\*\.' "$ENV" || sed -i "s|^BH_RETURN_ORIGINS=.*|BH_RETURN_ORIGINS=https://*.$domain|" "$ENV"
M=$S/state/map.json; [ -s "$M" ] || echo '{}' >"$M"; chmod 644 "$M"
for pair in "$@"; do jq --arg e "${pair%%=*}" --arg n "${pair#*=}" '. + {($e): $n}' "$M" >"$M.new"; chmod 644 "$M.new"; mv "$M.new" "$M"; done

install -m 755 "$R/platform/bin/devbox" /usr/local/sbin/devbox
install -m 755 "$W/setup/reconcile.sh" /usr/local/sbin/bh-workspace-reconcile
install -m 755 "$W/setup/guard.sh" /usr/local/sbin/bh-workspace-guard
install -D -m 644 "$W/setup/gitleaks.toml" /usr/local/share/bh-workspace/gitleaks.toml
docker pull -q zricethezav/gitleaks:v8.24.0 >/dev/null
[ -f /srv/edge/conf/public-routes.map ] || : >/srv/edge/conf/public-routes.map
install -d -m 755 "$S/state/guard"
(cd "$R/platform" && docker build -q -t devbox:current image >/dev/null)

B=$(mktemp -d /srv/bh-terminal/.build.XXXX); chmod 755 "$B"
tar -C "$A" --exclude=./node_modules --exclude=./data --exclude=./coverage --exclude=./.test-tmp -cf - . | tar -C "$B" --no-same-owner -xf -; chown -R "$U:$U" "$B"
docker run --rm -u 1000:1000 -e HOME=/tmp -e NODE_NO_WARNINGS=1 -v "$B:/w" -w /w --entrypoint bash devbox:current -c 'npm install --silent --no-audit --no-fund && npm test >/tmp/t 2>&1; rc=$?; tail -3 /tmp/t; exit $rc' </dev/null || { rm -rf "$B"; echo "Tests rot, nichts ausgerollt" >&2; exit 1; }
rm -rf "$B"
docker build -q -t bh-terminal:current "$A" >/dev/null
docker rm -f bh-terminal >/dev/null 2>&1 || true
docker run -d --name bh-terminal --network bh-apps-net --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m --cap-drop ALL --security-opt no-new-privileges \
  --memory 384m --memory-swap 512m --cpus 0.5 --pids-limit 128 \
  -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=3400 -e TRUST_PROXY_AUTH=1 -e DATA_DIR=/data -e BH_AUTH_URL=http://bh-auth:3337 \
  -e BH_TERMINAL_STATE=/state -e BH_TERMINAL_KEY=/ssh/id_ed25519 -e "BH_EDGE_SECRET=$(val BH_TERMINAL_EDGE_SECRET)" \
  -v "$S/state:/state:ro" -v "$S/ssh:/ssh:ro" -v "$S/data:/data" bh-terminal:current >/dev/null

cat >"$EDGE/terminal.inc" <<C
location = /terminal { return 302 /terminal/; }
location /terminal/ {
  auth_request /_auth;
  auth_request_set \$u_email \$upstream_http_x_auth_email;
  auth_request_set \$u_name \$upstream_http_x_auth_name;
  auth_request_set \$u_role \$upstream_http_x_auth_role;
  error_page 401 = @login;
  set \$app http://bh-terminal:3400;
  rewrite ^/terminal/(.*)\$ /\$1 break;
  proxy_pass \$app;
  proxy_http_version 1.1;
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection \$conn_upgrade;
  proxy_set_header Host \$host;
  proxy_set_header X-Edge-Secret $(val BH_TERMINAL_EDGE_SECRET);
  proxy_set_header X-User-Email \$u_email;
  proxy_set_header X-User-Name \$u_name;
  proxy_set_header X-User-Role \$u_role;
  proxy_set_header X-Forwarded-Proto https;
  proxy_read_timeout 1d;
  proxy_send_timeout 1d;
  client_max_body_size 60m;
}
C
chmod 644 "$EDGE/terminal.inc"
sed "s/__DOMAIN__/$domain/g" "$R/platform/edge/nginx.conf.template" >/srv/edge/conf/default.conf; chmod 644 /srv/edge/conf/default.conf
docker exec bh-edge nginx -t >/dev/null 2>&1 || { echo "nginx-Prüfung fehlgeschlagen" >&2; docker exec bh-edge nginx -t; exit 1; }
docker exec bh-edge nginx -s reload >/dev/null
bash "$R/platform/auth/setup-auth.sh" | tail -1
docker exec bh-auth node bin/register-app.js add "Terminal" "/terminal/" "Web-Terminal in deine Arbeitsumgebung" </dev/null || true

install -m 644 "$W"/setup/bh-workspace*.service "$W"/setup/bh-workspace*.timer /etc/systemd/system/
systemctl daemon-reload; systemctl enable --now bh-workspace.timer bh-workspace-guard.timer >/dev/null
echo "bh-workspace läuft"
