#!/usr/bin/env bash
# Builds and starts the login service (idempotent). Without a domain it stays internal.
set -euo pipefail
D=/srv/bh-auth; U=101000
install -d -m 711 "$D"
install -d -m 700 -o "$U" -g "$U" "$D/data"
ENV=/srv/bh-platform/.env
val() { sed -n "s/^$1=//p" "$ENV" | head -1; }
for k in BH_SCREEN_READ BH_SCREEN_WRITE BH_CONNECT_SECRET; do [ -n "$(val $k)" ] || (umask 077; echo "$k=$(openssl rand -hex 32)" >>"$ENV"); done
(umask 077; printf 'SCREEN_READ=%s\nSCREEN_WRITE=%s\nBH_CONNECT_SECRET=%s\nBH_ICLOUD_PHOTOS_OWNER=%s\nBH_ICLOUD_PHOTOS_ACCOUNT=%s\n' "$(val BH_SCREEN_READ)" "$(val BH_SCREEN_WRITE)" "$(val BH_CONNECT_SECRET)" "$(val BH_WORK_CALENDAR_OWNER)" "$(val BH_ICLOUD_PHOTOS_USER)" >"$D/screen.env")
(umask 077; printf 'PUBLIC_URL=%s\nAUTH_COOKIE_DOMAIN=%s\nRETURN_ORIGINS=%s\nGOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\n' \
  "$(val BH_PUBLIC_URL)" "$(val BH_COOKIE_DOMAIN)" "$(val BH_RETURN_ORIGINS)" "$(val GOOGLE_CLIENT_ID)" "$(val GOOGLE_CLIENT_SECRET)" >"$D/env")
docker build -q -t bh-auth:current /opt/bh-skill-library/services/bh-auth
docker network inspect bh-apps-net >/dev/null 2>&1 || docker network create bh-apps-net >/dev/null
docker rm -f bh-auth >/dev/null 2>&1 || true
docker run -d --name bh-auth --network bh-apps-net --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=32m \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 256m --memory-swap 384m --cpus 0.5 --pids-limit 128 \
  --env-file "$D/env" --env-file "$D/screen.env" -v "$D/data:/data" bh-auth:current >/dev/null
echo "bh-auth laeuft"
# The iCloud photo login passes through this service.
docker network inspect bh-icloud-net >/dev/null 2>&1 && docker network connect bh-icloud-net bh-auth 2>/dev/null || true
