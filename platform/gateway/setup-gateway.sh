#!/usr/bin/env bash
# Baut und startet den llm-proxy als Container "llm-gateway" (idempotent).
# Voraussetzung: /srv/llm-gateway/melious.key und der Proxy-Quellcode unter ./proxy-src
# (nicht Teil dieses Repos).
# Der Container wird nicht veroeffentlicht; erreichbar ist er nur aus den User-Netzen.
set -euo pipefail
cd "$(dirname "$0")"
D=/srv/llm-gateway; U=101000     # uid 1000 im Container
[ -s "$D/melious.key" ] || { echo "melious.key fehlt" >&2; exit 1; }

chmod 711 "$D"
install -d -m 750 -o "$U" -g "$U" "$D/config"
install -d -m 700 -o "$U" -g "$U" "$D/data"
install -m 440 -o "$U" -g "$U" tiers.json "$D/config/tiers.json"
if [ ! -f "$D/config/user-tokens.json" ]; then
  echo '{}' >"$D/config/user-tokens.json"
  chown "$U:$U" "$D/config/user-tokens.json"; chmod 400 "$D/config/user-tokens.json"
fi
(
  umask 077
  [ -s "$D/admin.token" ] || openssl rand -hex 32 >"$D/admin.token"
  printf 'MELIOUS_API_KEY=%s\nLLM_PROXY_TOKEN=%s\n' "$(cat "$D/melious.key")" "$(cat "$D/admin.token")" >"$D/env"
)

docker build -q -t llm-gateway:current proxy-src
docker network inspect llm-gateway-net >/dev/null 2>&1 || docker network create llm-gateway-net >/dev/null
docker rm -f llm-gateway >/dev/null 2>&1 || true
docker run -d --name llm-gateway --network llm-gateway-net --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 384m --memory-swap 512m --cpus 0.5 --pids-limit 128 \
  --env-file "$D/env" \
  -e LLM_PROXY_TIERS_FILE=/etc/llm-gateway/tiers.json \
  -e LLM_PROXY_USER_TOKENS_FILE=/etc/llm-gateway/user-tokens.json \
  -e LLM_PROXY_LOG_DIR=/var/lib/llm-gateway \
  -e LLM_PROXY_DAILY_CAP_EUR=10 -e LLM_PROXY_DAILY_WARN_EUR=5 -e LLM_PROXY_STREAM_TOOL_DELTAS=1 \
  -v "$D/config:/etc/llm-gateway:ro" -v "$D/data:/var/lib/llm-gateway" \
  llm-gateway:current >/dev/null

for net in $(docker network ls --format '{{.Name}}' | grep '^devbox-net-' || true); do
  docker network connect "$net" llm-gateway
done
echo "llm-gateway laeuft"
