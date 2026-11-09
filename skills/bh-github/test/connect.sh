#!/usr/bin/env bash
# Tests bh-github-connect with stubs for gh and curl. Runs without network and without an account.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export HOME=$T/home BH_TOKEN_FILE=$T/tok PATH=$T/bin:$PATH CURL_LOG=$T/curl GH_STATE=$T/authed GH_FAIL=$T/fail
mkdir -p "$HOME" "$T/bin"; echo user-token >"$BH_TOKEN_FILE"; : >"$CURL_LOG"
cat >"$T/bin/gh" <<'S'
#!/usr/bin/env bash
case "$1 $2" in
  "auth status") [ -e "$GH_STATE" ] ;;
  "auth login") echo "! First copy your one-time code: AB12-CD34"; sleep 1; [ -e "$GH_FAIL" ] && exit 1; touch "$GH_STATE" ;;
  "auth setup-git") : ;;
  "auth token") echo gho_geheim ;;
  "api user") case "$4" in .login) echo octo ;; .id) echo 42 ;; *) echo "Octo Cat" ;; esac ;;
esac
S
cat >"$T/bin/curl" <<'S'
#!/usr/bin/env bash
{ echo "$*"; cat; } >>"$CURL_LOG"
S
chmod +x "$T/bin/gh" "$T/bin/curl"
C=$here/scripts/bh-github-connect; fail=0
ok() { if eval "$2"; then echo "  ok    $1"; else echo "  FEHL  $1"; fail=1; fi; }

out=$("$C" | cat)
ok "zeigt Link und Code" 'grep -q "login/device" <<<"$out" && grep -q AB12-CD34 <<<"$out"'
ok "wartet ohne Terminal nicht" '! [ -s "$HOME/.cache/bh-github-connect/connected" ]'
sleep 2.5
ok "Status nach Bestaetigung" '"$C" --status | grep -q "octo"'
ok "Git-Identitaet gesetzt" '[ "$(git config --global user.email)" = "42+octo@users.noreply.github.com" ] && [ "$(git config --global user.name)" = "Octo Cat" ]'
ok "Token ans Gateway mit User-Token" 'grep -q "gho_geheim" "$CURL_LOG" && grep -q "Bearer user-token" "$CURL_LOG" && grep -q "connect/github" "$CURL_LOG"'
ok "Token nicht im Log" '! grep -q gho_geheim "$HOME/.cache/bh-github-connect/login.log"'
git config --global user.name "Eigener Name"
ok "bestehender Login: direkt aktiv" '"$C" | grep -q "Verknuepft"'
ok "eigene Git-Identitaet bleibt" '[ "$(git config --global user.name)" = "Eigener Name" ]'
rm -f "$GH_STATE"; touch "$GH_FAIL"; rm -rf "$HOME/.cache/bh-github-connect"
"$C" >/dev/null; sleep 2.5
ok "Fehlschlag wird gemeldet" '! "$C" --status 2>/dev/null'
exit $fail
