#!/usr/bin/env bash
# Freezes the iCloud download before the VPS disk runs full and lets it go on once the upload has made room.
# Pause, not stop: the Apple password lives only in the container's memory.
set -uo pipefail
free_kb=$(df --output=avail -k / | tail -1)
paused=$(docker inspect -f '{{.State.Paused}}' bh-icloud-photos 2>/dev/null) || exit 0
if [ "$free_kb" -lt $((6 * 1024 * 1024)) ] && [ "$paused" = false ]; then
  docker pause bh-icloud-photos >/dev/null && logger -t bh-icloud "Download angehalten, nur noch $((free_kb / 1024)) MB frei"
elif [ "$free_kb" -gt $((10 * 1024 * 1024)) ] && [ "$paused" = true ]; then
  docker unpause bh-icloud-photos >/dev/null && logger -t bh-icloud "Download geht weiter, $((free_kb / 1024)) MB frei"
fi
