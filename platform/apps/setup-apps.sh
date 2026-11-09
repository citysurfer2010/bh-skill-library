#!/usr/bin/env bash
# Builds and starts the app container (idempotent). `bhapp` manages the apps afterwards.
set -euo pipefail
cd "$(dirname "$0")"
D=/srv/bh-apps; U=101000; ENV=/srv/bh-platform/.env; TOKENS=/srv/llm-gateway/config/user-tokens.json; L=/srv/bh-apps-llm
val() { sed -n "s/^$1=//p" "$ENV" | head -1; }
install -d -m 755 "$D"; install -d -m 711 "$L"; install -d -m 700 -o "$U" -g "$U" "$L/llm"
# Separate gateway token for the apps: costs appear apart from the users.
[ -n "$(val BH_APPS_LLM_TOKEN)" ] || (umask 077; echo "BH_APPS_LLM_TOKEN=$(openssl rand -hex 32)" >>"$ENV")
jq --arg t "$(val BH_APPS_LLM_TOKEN)" 'with_entries(select(.value != "app/bh-apps")) + {($t): "app/bh-apps"}' "$TOKENS" >"$TOKENS.new"
chown "$U:$U" "$TOKENS.new"; chmod 400 "$TOKENS.new"; mv "$TOKENS.new" "$TOKENS"
printf '%s' "$(val BH_APPS_LLM_TOKEN)" >"$L/llm/token.new"; chown "$U:$U" "$L/llm/token.new"; chmod 400 "$L/llm/token.new"; mv "$L/llm/token.new" "$L/llm/token"
install -m 755 bhapp /usr/local/sbin/bhapp
docker build -q -t bh-apps:current . >/dev/null
docker network inspect bh-apps-net >/dev/null 2>&1 || docker network create bh-apps-net >/dev/null
docker rm -f bh-apps >/dev/null 2>&1 || true
docker run -d --name bh-apps --network bh-apps-net --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=128m \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 1500m --memory-swap 2g --cpus 0.9 --pids-limit 512 \
  -v "$D:/apps" -v "$L/llm:/etc/devbox/llm:ro" bh-apps:current >/dev/null
docker network connect bh-apps-net llm-gateway 2>/dev/null || true
docker network connect bh-apps-net mcp-gateway 2>/dev/null || true
echo "bh-apps laeuft"
