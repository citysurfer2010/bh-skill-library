#!/usr/bin/env bash
# Starts the iCloud photo download. Its own network: internet yes, Synology and gateway no.
set -euo pipefail
LIB=/opt/bh-skill-library/skills/bh-icloud/photo-sync; D=/srv/icloud-photos; ENV=/srv/bh-platform/.env; U=101000
user=$(sed -n 's/^BH_ICLOUD_PHOTOS_USER=//p' "$ENV" | tail -1)
[ -n "$user" ] || { echo "BH_ICLOUD_PHOTOS_USER fehlt in der .env" >&2; exit 1; }
install -d -m 750 -o "$U" -g "$U" "$D" "$D/inbox" "$D/cookies"
docker build -q -t bh-icloud-photos "$LIB/worker" >/dev/null
docker network inspect bh-icloud-net >/dev/null 2>&1 || docker network create bh-icloud-net >/dev/null
docker rm -f bh-icloud-photos >/dev/null 2>&1 || true
docker run -d --name bh-icloud-photos --network bh-icloud-net --restart unless-stopped --cpus 0.5 --memory 512m \
  --read-only --tmpfs /tmp:rw,exec,size=256m --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp \
  -v "$D/inbox:/data/inbox" -v "$D/cookies:/data/cookies" bh-icloud-photos \
  icloudpd --username "$user" --directory /data/inbox --cookie-directory /data/cookies --folder-structure "{:%Y/%Y-%m}" \
  --size original --recent 300 --password-provider webui --mfa-provider webui --watch-with-interval 86400 --no-progress-bar >/dev/null
docker network connect bh-icloud-net bh-auth 2>/dev/null || true
# Freezes the download before the VPS disk runs full.
install -m 755 "$LIB/disk-guard.sh" /usr/local/sbin/bh-icloud-disk-guard
install -m 644 "$LIB"/bh-icloud-disk-guard.service "$LIB"/bh-icloud-disk-guard.timer /etc/systemd/system/
systemctl daemon-reload; systemctl enable --now bh-icloud-disk-guard.timer >/dev/null
echo "bh-icloud-photos laeuft"
