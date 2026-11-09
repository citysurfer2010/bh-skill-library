#!/bin/bash
# Erststart: leeres Home aus dem Skeleton befuellen, danach nie wieder anfassen.
set -eu
if [ ! -e "$HOME/.devbox-initialized" ]; then
  cp -an /etc/devbox/skel/. "$HOME"/
  mkdir -p "$HOME/projects" "$HOME/.local/bin"
  touch "$HOME/.devbox-initialized"
fi
# Gemeinsame Skills einhaengen; einen eigenen Ordner des Users nie ersetzen.
mkdir -p "$HOME/.config/opencode"
[ -e "$HOME/.config/opencode/skills" ] || ln -s /etc/devbox/skills "$HOME/.config/opencode/skills"
# Verteilt die Subdomain auf die eigenen Apps (siehe Skill bh-workspace).
[ -f "$HOME/.local/bin/bh-router.mjs" ] && nohup node "$HOME/.local/bin/bh-router.mjs" >/tmp/bh-router.log 2>&1 &
exec /usr/sbin/sshd -D -e -f /etc/devbox/sshd_config
