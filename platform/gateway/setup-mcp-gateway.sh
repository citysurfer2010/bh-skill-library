#!/usr/bin/env bash
# Baut und startet das zentrale MCP-Gateway (idempotent). Nicht veroeffentlicht,
# erreichbar nur aus den User-Netzen. Den OAuth-Client legt der Admin nach
# /srv/mcp-gateway/google/client_secret.json (Besitzer 101000, Rechte 400).
set -euo pipefail
D=/srv/mcp-gateway; U=101000; S=/opt/bh-skill-library/skills
install -d -m 711 "$D"
install -d -m 700 -o "$U" -g "$U" "$D/users"
install -d -m 750 -o "$U" -g "$U" "$D/google"
docker build -q -t mcp-gateway:current "$S/bh-mcp-gateway"
docker network inspect mcp-gateway-net >/dev/null 2>&1 || docker network create mcp-gateway-net >/dev/null
docker rm -f mcp-gateway >/dev/null 2>&1 || true
docker run -d --name mcp-gateway --network mcp-gateway-net --restart unless-stopped \
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
