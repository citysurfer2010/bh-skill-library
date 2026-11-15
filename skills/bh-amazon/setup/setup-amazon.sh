#!/usr/bin/env bash
# Builds and starts the Amazon worker (idempotent). Reachable only inside bh-apps-net; outgoing to amazon.de.
# Key: BH_AMAZON_TOKEN in /srv/bh-platform/.env, handed to the worker and (read only) to the apps.
set -euo pipefail
LIB=/opt/bh-skill-library/skills/bh-amazon; ENV=/srv/bh-platform/.env; S=/srv/bh-amazon; L=/srv/bh-apps-llm/llm
val() { sed -n "s/^$1=//p" "$ENV" | head -1; }
[ -n "$(val BH_AMAZON_TOKEN)" ] || (umask 077; echo "BH_AMAZON_TOKEN=$(openssl rand -hex 32)" >>"$ENV")
docker build -q -t bh-amazon:current "$LIB/worker" >/dev/null
PW=$(docker run --rm --entrypoint id bh-amazon:current -u)
install -d -m 711 "$S"; install -d -m 700 -o "$PW" -g "$PW" "$S/state" "$S/run"
printf '%s' "$(val BH_AMAZON_TOKEN)" >"$S/run/token.new"; chown "$PW:$PW" "$S/run/token.new"; chmod 400 "$S/run/token.new"; mv "$S/run/token.new" "$S/run/token"
printf '%s' "$(val BH_AMAZON_TOKEN)" >"$L/amazon-token.new"; chown 101000:101000 "$L/amazon-token.new"; chmod 400 "$L/amazon-token.new"; mv "$L/amazon-token.new" "$L/amazon-token"
docker network inspect bh-apps-net >/dev/null 2>&1 || docker network create bh-apps-net >/dev/null
docker rm -f bh-amazon >/dev/null 2>&1 || true
docker run -d --name bh-amazon --network bh-apps-net --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=256m --shm-size 256m -e HOME=/tmp \
  --cap-drop ALL --security-opt no-new-privileges --memory 1g --memory-swap 1500m --cpus 1 --pids-limit 512 \
  -v "$S/state:/state" -v "$S/run:/run/bh-amazon:ro" bh-amazon:current >/dev/null
for i in $(seq 1 20); do docker exec bh-amazon node -e "fetch('http://127.0.0.1:3800/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null && break; sleep 1; done
echo "bh-amazon laeuft"
