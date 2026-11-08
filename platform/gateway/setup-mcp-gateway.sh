#!/usr/bin/env bash
# Baut und startet das zentrale MCP-Gateway (idempotent). Nicht veroeffentlicht,
# erreichbar nur aus den User-Netzen. Den OAuth-Client legt der Admin nach
# /srv/mcp-gateway/google/client_secret.json (Besitzer 101000, Rechte 400).
set -euo pipefail
D=/srv/mcp-gateway; U=101000; S=/opt/bh-skill-library/skills
install -d -m 711 "$D"
install -d -m 700 -o "$U" -g "$U" "$D/users"
install -d -m 750 -o "$U" -g "$U" "$D/google"
ENV=/srv/bh-platform/.env; val() { sed -n "s/^$1=//p" "$ENV" | tail -1; }
(umask 077; printf 'BH_NAS_URL=https://%s:5001\nBH_NAS_CA_B64=%s\nBH_NAS_FP=%s\n' "$(val BH_NAS_IP)" "$(val BH_NAS_CA_B64)" "$(val BH_NAS_FP)" >"$D/nas.env"
  printf 'BH_BEAMER_IP=%s\nBH_BEAMER_CA_B64=%s\nBH_BEAMER_FP=%s\n' "$(val BH_BEAMER_IP)" "$(val BH_BEAMER_CA_B64)" "$(val BH_BEAMER_FP)" >>"$D/nas.env")
docker build -q -t mcp-gateway:current "$S/bh-mcp-gateway"
docker network inspect mcp-gateway-net >/dev/null 2>&1 || docker network create mcp-gateway-net >/dev/null
docker rm -f mcp-gateway >/dev/null 2>&1 || true
# gw-priority: Ausgehender Verkehr verlaesst den Container ueber sein eigenes Netz, nur das hat die Firewall-Ausnahme.
docker run -d --name mcp-gateway --network name=mcp-gateway-net,gw-priority=100 --restart unless-stopped --env-file "$D/nas.env" \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 512m --memory-swap 768m --cpus 0.5 --pids-limit 256 \
  -v "$S:/opt/skills:ro" \
  -v "$D/google:/etc/mcp-gateway/google:ro" \
  -v /srv/llm-gateway/config:/etc/mcp-gateway/tokens:ro \
  -v "$D/users:/var/lib/mcp-gateway/users" \
  mcp-gateway:current >/dev/null
for net in $(docker network ls --format '{{.Name}}' | grep '^devbox-net-' || true); do
  docker network connect "$net" mcp-gateway
done
echo "mcp-gateway laeuft"
