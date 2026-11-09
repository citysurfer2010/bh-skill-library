#!/usr/bin/env bash
# Builds and starts the central MCP gateway (idempotent). Not published,
# reachable only from the user networks. The admin places the OAuth client at
# /srv/mcp-gateway/google/client_secret.json (owner 101000, mode 400).
set -euo pipefail
D=/srv/mcp-gateway; U=101000; S=/opt/bh-skill-library/skills
install -d -m 711 "$D"
install -d -m 700 -o "$U" -g "$U" "$D/users"
install -d -m 750 -o "$U" -g "$U" "$D/google"
install -d -m 700 -o "$U" -g "$U" "$D/family"
ENV=/srv/bh-platform/.env; val() { sed -n "s/^$1=//p" "$ENV" | tail -1; }
(umask 077; printf 'BH_NAS_URL=https://%s:5001\nBH_NAS_CA_B64=%s\nBH_NAS_FP=%s\n' "$(val BH_NAS_IP)" "$(val BH_NAS_CA_B64)" "$(val BH_NAS_FP)" >"$D/nas.env"
  printf 'BH_BEAMER_IP=%s\nBH_BEAMER_MAC=%s\nBH_BEAMER_CA_B64=%s\nBH_BEAMER_FP=%s\n' "$(val BH_BEAMER_IP)" "$(val BH_BEAMER_MAC)" "$(val BH_BEAMER_CA_B64)" "$(val BH_BEAMER_FP)" >>"$D/nas.env"
  printf 'BH_WEBUNTIS_SERVER=%s\nBH_WEBUNTIS_SCHOOL=%s\nBH_WEBUNTIS_USER=%s\nBH_WEBUNTIS_PASSWORD=%s\n' "$(val BH_WEBUNTIS_SERVER)" "$(val BH_WEBUNTIS_SCHOOL)" "$(val BH_WEBUNTIS_USER)" "$(val BH_WEBUNTIS_PASSWORD)" >>"$D/nas.env"
  printf 'BH_FAMILY_CALENDAR_ID=%s\n' "$(val BH_FAMILY_CALENDAR_ID)" >>"$D/nas.env"
  printf 'BH_WORK_CALENDAR_ID=%s\nBH_WORK_CALENDAR_OWNER=%s\n' "$(val BH_WORK_CALENDAR_ID)" "$(val BH_WORK_CALENDAR_OWNER)" >>"$D/nas.env"
  printf 'BH_CONNECT_SECRET=%s\n' "$(val BH_CONNECT_SECRET)" >>"$D/nas.env"
  printf 'BH_NETATMO_USER=%s\nBH_NETATMO_PASSWORD=%s\nBH_FAMILY_DIR=/var/lib/mcp-gateway/family\n' "$(val BH_NETATMO_USER)" "$(val BH_NETATMO_PASSWORD)" >>"$D/nas.env"
  printf 'BH_SCREEN_URL=%s/screen/%s\nBH_SCREEN_WRITE=%s\nBH_AUTH_INTERNAL=http://bh-auth:3337\n' "$(val BH_PUBLIC_URL)" "$(val BH_SCREEN_READ)" "$(val BH_SCREEN_WRITE)" >>"$D/nas.env")
docker build -q -t mcp-gateway:current "$S/bh-mcp-gateway"
docker network inspect mcp-gateway-net >/dev/null 2>&1 || docker network create mcp-gateway-net >/dev/null
docker rm -f mcp-gateway >/dev/null 2>&1 || true
# gw-priority: outgoing traffic leaves the container through its own network, only that has the firewall exception.
# Derive the skills' Google access from .env; same OAuth app as the login (redirect http://localhost:8765/ registered).
if [ -n "$(val GOOGLE_CLIENT_ID)" ]; then
  (umask 077; jq -n --arg i "$(val GOOGLE_CLIENT_ID)" --arg s "$(val GOOGLE_CLIENT_SECRET)" '{web: {client_id: $i, client_secret: $s}}' >"$D/google/client_secret.json.new")
  chown "$U:$U" "$D/google/client_secret.json.new"; chmod 400 "$D/google/client_secret.json.new"; mv "$D/google/client_secret.json.new" "$D/google/client_secret.json"
fi
docker run -d --name mcp-gateway --network name=mcp-gateway-net,gw-priority=100 --restart unless-stopped --env-file "$D/nas.env" \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --memory-swap 768m --cpus 0.5 --pids-limit 256 \
  -v "$S:/opt/skills:ro" \
  -v "$D/google:/etc/mcp-gateway/google:ro" \
  -v /srv/llm-gateway/config:/etc/mcp-gateway/tokens:ro \
  -v "$D/users:/var/lib/mcp-gateway/users" \
  -v "$D/family:/var/lib/mcp-gateway/family" \
  mcp-gateway:current >/dev/null
for net in $(docker network ls --format '{{.Name}}' | grep '^devbox-net-' || true); do
  docker network connect "$net" mcp-gateway
done
# Only for the Beamer's display page in the login service.
docker network connect bh-apps-net mcp-gateway 2>/dev/null || true
echo "mcp-gateway laeuft"
