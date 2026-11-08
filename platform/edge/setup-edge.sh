#!/usr/bin/env bash
# Startet Web-Eingang (nginx) und Cloudflare-Tunnel (idempotent). Es werden keine Ports geoeffnet.
# Vorher: setup-cloudflare.py
set -euo pipefail
cd "$(dirname "$0")"
ENV=/srv/bh-platform/.env; D=/srv/edge
val() { sed -n "s/^$1=//p" "$ENV" | head -1; }
domain=$(val EDGE_DOMAIN); [ -n "$domain" ] && [ -n "$(val CLOUDFLARE_TUNNEL_TOKEN)" ] || { echo "EDGE_DOMAIN oder Tunnel-Token fehlt" >&2; exit 1; }
install -d -m 711 "$D"; install -d -m 755 "$D/conf"
sed "s/__DOMAIN__/$domain/g" nginx.conf.template >"$D/conf/default.conf"; chmod 644 "$D/conf/default.conf"
(umask 077; printf 'TUNNEL_TOKEN=%s\n' "$(val CLOUDFLARE_TUNNEL_TOKEN)" >"$D/tunnel.env")
docker network inspect bh-apps-net >/dev/null 2>&1 || docker network create bh-apps-net >/dev/null
docker rm -f bh-edge cloudflared >/dev/null 2>&1 || true
docker run -d --name bh-edge --network bh-apps-net --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=32m --cap-drop ALL --security-opt no-new-privileges \
  --memory 64m --cpus 0.3 --pids-limit 32 \
  -v "$D/conf:/etc/nginx/conf.d:ro" \
  nginxinc/nginx-unprivileged:stable-alpine >/dev/null
docker run -d --name cloudflared --network bh-apps-net --restart unless-stopped \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 128m --cpus 0.3 --pids-limit 64 --env-file "$D/tunnel.env" \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run >/dev/null
echo "Web-Eingang und Tunnel laufen"
