#!/usr/bin/env bash
# Builds the workspace for every user who has accepted their invitation. Runs every 15 seconds as root.
# This way the web service gets no Docker rights at all: it only reads the result.
set -uo pipefail
S=/srv/bh-terminal; ST=$S/state; U=/srv/devbox/users; PUB=$S/ssh/id_ed25519.pub
DOMAIN=$(sed -n 's/^EDGE_DOMAIN=//p' /srv/bh-platform/.env | head -1)
RESERVED=" apps auth www mail smtp imap autodiscover admin api root dev terminal "
RETRY_SECONDS=600
exec 9>/run/bh-workspace.lock; flock -n 9 || exit 0
docker inspect -f '{{.State.Running}}' bh-auth 2>/dev/null | grep -q true || exit 0
emails=$(docker exec bh-auth node bin/list-users.js </dev/null) || exit 0
MAP=$ST/map.json; [ -s "$MAP" ] || echo '{}' >"$MAP"

taken() { jq -e --arg n "$1" 'any(.[]; . == $n)' "$MAP" >/dev/null || [ -d "$U/$1" ] || [[ $RESERVED == *" $1 "* ]]; }
derive() {
  local b n i=2
  b=$(printf '%s' "${1%%@*}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^[^a-z]+//; s/-+$//' | cut -c1-28)
  [ ${#b} -ge 2 ] || b=user-$b; n=$b
  while taken "$n"; do n=$b-$i; i=$((i + 1)); done
  echo "$n"
}
status() { # name state
  local f=$ST/status/$1.json new
  new=$(jq -n --arg s "$2" --arg d "$1.$DOMAIN" --argjson at "$(date +%s)" '{state: $s, subdomain: $d, at: $at}')
  [ "$(jq -r .state "$f" 2>/dev/null)" = "$2" ] || { printf '%s\n' "$new" >"$f.new"; chmod 644 "$f.new"; mv "$f.new" "$f"; }
}
ensure_key() { # Web terminal access, without forwarding; also survives "devbox set-key".
  local a=$U/$1/ssh/authorized_keys line
  line="restrict,pty $(cat "$PUB")"
  grep -qxF "$line" "$a" && return
  { grep -vF "$(awk '{print $2}' "$PUB")" "$a" || true; echo "$line"; } >"$a.new"; chmod 644 "$a.new"; mv "$a.new" "$a"
}
build() {
  local n=$1
  if [ ! -d "$U/$n" ]; then devbox add "$n" "$PUB" >/dev/null || return 1
  elif ! docker inspect "devbox-$n" >/dev/null 2>&1; then devbox recreate "$n" >/dev/null || return 1; fi
  ensure_key "$n" || return 1
  install -m 644 "$U/$n/ssh/ssh_host_ed25519_key.pub" "$ST/hostkeys/$n.pub" || return 1
  local c; for c in bh-terminal bh-edge; do
    docker inspect -f '{{json .NetworkSettings.Networks}}' "$c" | grep -q "devbox-net-$n" || docker network connect "devbox-net-$n" "$c" || return 1
  done
}

while read -r email; do
  [ -n "$email" ] || continue
  n=$(jq -r --arg e "$email" '.[$e] // empty' "$MAP")
  if [ -z "$n" ]; then
    n=$(derive "$email")
    jq --arg e "$email" --arg n "$n" '. + {($e): $n}' "$MAP" >"$MAP.new"; chmod 644 "$MAP.new"; mv "$MAP.new" "$MAP"
  fi
  f=$ST/status/$n.json
  [ "$(jq -r .state "$f" 2>/dev/null)" != failed ] || [ $(( $(date +%s) - $(jq -r .at "$f") )) -ge $RETRY_SECONDS ] || continue
  [ "$(jq -r .state "$f" 2>/dev/null)" = ready ] || status "$n" preparing
  if build "$n"; then status "$n" ready; else status "$n" failed; echo "Fehler beim Aufbau für $n" >&2; fi
done <<<"$emails"
# The iCloud photo login is served through bh-auth, which loses this network when it is recreated.
docker network inspect bh-icloud-net >/dev/null 2>&1 && docker network connect bh-icloud-net bh-auth 2>/dev/null || true
