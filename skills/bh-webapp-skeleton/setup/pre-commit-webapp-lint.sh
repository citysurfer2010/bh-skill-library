#!/usr/bin/env bash
# BH commit gate. Checks the staged state of a web app:
#   - new or growing files over 200 lines (public/, server.js, routes/, lib/)
#   - new fixed style="..." attributes in HTML/JS
#   - new browser popups (window.alert/confirm/prompt)
#   - test/validate.test.js (static structure, JS syntax, standalone rules)
# Trend-based: existing issues may stay and shrink, nothing new may be added.
# Bypass (--no-verify) only in an emergency.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

staged=$(git diff --cached --name-only --diff-filter=ACMR \
  | grep -E '^(public/.*\.(js|html|css)|server\.js|routes/.*\.js|lib/.*\.js)$' \
  | grep -vE '^public/(vendor|assets)/' || true)

head_of() { git show "HEAD:$1" 2>/dev/null || true; }
count_styles() { grep -E 'style="[^"]*"' | grep -v '\${' | grep -vc 'style="--'; }
count_popups() {
  grep -vE '^[[:space:]]*(//|\*|/\*)' | grep -vE '(^|[^A-Za-z0-9_.])function[[:space:]]' \
    | grep -cE '(^|[^A-Za-z0-9_.])(window\.)?(alert|confirm|prompt)[[:space:]]*\('
}

errors=()
while IFS= read -r file; do
  [ -n "$file" ] || continue
  new=$(git show ":$file")
  old=$(head_of "$file")
  lines_new=$(printf '%s\n' "$new" | wc -l)
  lines_old=0; [ -z "$old" ] || lines_old=$(printf '%s\n' "$old" | wc -l)
  if [ "$lines_new" -gt 200 ] && { [ "$lines_old" -eq 0 ] || [ "$lines_new" -gt "$lines_old" ]; }; then
    errors+=("$file: $lines_old -> $lines_new Zeilen (Grenze 200). In kleine Module aufteilen.")
  fi
  case "$file" in
    *.html|*.js)
      s_new=$(printf '%s\n' "$new" | count_styles); s_old=$(printf '%s\n' "$old" | count_styles)
      [ "${s_new:-0}" -gt "${s_old:-0}" ] && errors+=("$file: feste style=-Attribute $s_old -> $s_new. Klasse in public/css/ anlegen.")
      p_new=$(printf '%s\n' "$new" | count_popups); p_old=$(printf '%s\n' "$old" | count_popups)
      [ "${p_new:-0}" -gt "${p_old:-0}" ] && errors+=("$file: Browser-Popups $p_old -> $p_new. BH-Dialog oder Toast verwenden.")
      ;;
  esac
done <<< "$staged"

if [ -f test/validate.test.js ] && command -v node >/dev/null 2>&1; then
  if ! out=$(NODE_NO_WARNINGS=1 node --test test/validate.test.js 2>&1); then
    errors+=("test/validate.test.js ist rot:")
    errors+=("$(printf '%s\n' "$out" | grep -E '^not ok|error:|failureType' | head -20)")
  fi
fi

if [ ${#errors[@]} -gt 0 ]; then
  echo "Commit abgelehnt:" >&2
  printf '  %s\n' "${errors[@]}" >&2
  exit 1
fi
exit 0
