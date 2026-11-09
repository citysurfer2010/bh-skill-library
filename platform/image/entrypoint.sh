#!/bin/bash
# First start: fill the empty home from the skeleton, never touch it afterwards.
set -eu
if [ ! -e "$HOME/.devbox-initialized" ]; then
  cp -an /etc/devbox/skel/. "$HOME"/
  mkdir -p "$HOME/projects" "$HOME/.local/bin"
  touch "$HOME/.devbox-initialized"
fi
# Mount the shared skills; never replace a folder of the user's own.
mkdir -p "$HOME/.config/opencode"
[ -e "$HOME/.config/opencode/skills" ] || ln -s /etc/devbox/skills "$HOME/.config/opencode/skills"
# Same context, rules and hooks for everyone (see skill bh-opencode).
mkdir -p "$HOME/.config/opencode/plugins"
ln -sfn /etc/devbox/skills/bh-opencode/plugin/bh-guard.js "$HOME/.config/opencode/plugins/bh-guard.js"
# Routes the subdomain to the user's own apps (see skill bh-workspace).
[ -f "$HOME/.local/bin/bh-router.mjs" ] && nohup node "$HOME/.local/bin/bh-router.mjs" >/tmp/bh-router.log 2>&1 &
exec /usr/sbin/sshd -D -e -f /etc/devbox/sshd_config
