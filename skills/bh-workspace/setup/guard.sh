#!/usr/bin/env bash
# Sicherheits-Wächter: Eine App wird nur öffentlich, wenn sie geprüft und sauber ist. Läuft alle 5 Minuten als root.
# Geprüft wird neu, sobald sich Dateien ändern; Live-Abfragen laufen immer. Fund = sofort nicht mehr öffentlich.
set -uo pipefail
S=/srv/bh-terminal; ST=$S/state; U=/srv/devbox/users; G=$ST/guard; MAP_OUT=/srv/edge/conf/public-routes.map
IMAGE=zricethezav/gitleaks:v8.24.0; CFG=/usr/local/share/bh-workspace/gitleaks.toml
DOMAIN=$(sed -n 's/^EDGE_DOMAIN=//p' /srv/bh-platform/.env | head -1)
DOMAIN=${DOMAIN//./\\.}
SECRET='BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|AKIA[0-9A-Z]{16}|GOCSPX-[A-Za-z0-9_-]{10}|xox[baprs]-[0-9A-Za-z-]{20}'
GATEWAY='/etc/devbox/llm/token|llm-gateway|mcp-gateway'
exec 9>/run/bh-workspace-guard.lock; flock -n 9 || exit 0
install -d -m 755 "$G"; [ -f "$MAP_OUT" ] || : >"$MAP_OUT"

finding() { jq -n --arg r "$1" --arg t "$2" --arg f "${3:-}" '{rule: $r, text: $t, file: $f}'; }
probe() { docker exec bh-edge wget -q -T 5 -O - "http://devbox-$1:8088$2" 2>/dev/null </dev/null | head -c 200000; }
code_scan() { # home-Pfad, relativer Ordner. Ausgabe: Funde als JSON-Zeilen. Geheimnisse werden nie ausgegeben.
  local dir=$1/$2 r
  r=$(docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 --memory 512m --pids-limit 64 \
      -v "$dir:/scan:ro" -v "$CFG:/cfg.toml:ro" "$IMAGE" dir /scan --no-banner --redact --config /cfg.toml --exit-code 0 --log-level error --report-format json --report-path /dev/stdout 2>/dev/null </dev/null) || { finding scan-failed "Die Prüfung konnte nicht laufen"; return; }
  printf '%s' "$r" | jq -c '.[]? | {rule: .RuleID, text: "Mögliches Geheimnis im Code", file: (.File | sub("^/scan/"; ""))}' 2>/dev/null | head -20
  ( cd "$dir" && grep -rIlE --exclude-dir=node_modules --exclude-dir=.git "$GATEWAY" . 2>/dev/null | head -5 ) | while read -r f; do finding gateway-access "Die App nutzt das KI- oder MCP-Gateway. Öffentlich könnte jeder deine Kosten auslösen." "${f#./}" | jq -c .; done
  ( cd "$dir" && find . -path ./node_modules -prune -o -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name 'id_rsa' -o -name 'id_ed25519' -o -name '*.sqlite' -o -name '*.db' \) -print 2>/dev/null | grep -v '\.example$' | head -5 ) | while read -r f; do finding sensitive-file "Sensible Datei im App-Ordner. Sie darf nicht ausgeliefert werden." "${f#./}" | jq -c .; done
}
live_scan() { # name, pfad
  local b; [ "$2" = / ] && b= || b=$2
  local root; root=$(probe "$1" "$b/")
  [ -n "$root" ] || { finding not-running "Die App antwortet gerade nicht" | jq -c .; return; }
  printf '%s' "$root" | grep -qE "$SECRET" && finding leak-in-page "In der ausgelieferten Seite steht etwas, das wie ein Geheimnis aussieht" | jq -c .
  local body
  body=$(probe "$1" "$b/.env");            printf '%s' "$body" | grep -qE '^[A-Z][A-Z0-9_]*=' && finding exposed-env "Die Datei .env ist öffentlich abrufbar" ".env" | jq -c .
  body=$(probe "$1" "$b/.git/config");     printf '%s' "$body" | grep -q '\[core\]' && finding exposed-git "Der Ordner .git ist öffentlich abrufbar" ".git/config" | jq -c .
  body=$(probe "$1" "$b/.git/HEAD");       printf '%s' "$body" | grep -q '^ref: ' && finding exposed-git "Der Ordner .git ist öffentlich abrufbar" ".git/HEAD" | jq -c .
  body=$(probe "$1" "$b/package.json");    printf '%s' "$body" | grep -q '"dependencies"' && finding exposed-source "Quelldateien sind öffentlich abrufbar" "package.json" | jq -c .
  body=$(probe "$1" "$b/server.js");       printf '%s' "$body" | grep -qE 'require\(|^import ' && finding exposed-source "Quelldateien sind öffentlich abrufbar" "server.js" | jq -c .
  return 0
}

new_map=$(mktemp)
for ud in "$U"/*/; do
  n=$(basename "$ud"); h=$ud/home; f=$h/.config/bh-apps/routes.json; out=$G/$n.json; prev='{}'; [ -s "$out" ] && prev=$(cat "$out")
  [ -f "$f" ] && [ ! -L "$f" ] || { rm -f "$out"; continue; }
  results='{}'
  while IFS=$'\t' read -r path port dir; do
    [[ $path =~ ^/([a-z0-9-]+(/[a-z0-9-]+)*)?$ ]] && [[ $port =~ ^[0-9]+$ ]] || continue
    findings=""; hash=""
    # Nur ein Ordner im eigenen Home, nie über symbolische Links hinaus.
    real=$(realpath -e "$h/$dir" 2>/dev/null || true); home_real=$(realpath -e "$h")
    if [ -z "$dir" ] || [ -z "$real" ] || [ ! -d "$real" ] || [[ $real != "$home_real/"* ]]; then
      findings=$(finding no-folder "Gib den Ordner der App an, damit er geprüft werden kann" | jq -c .)
    else
      rel=${real#"$home_real"/}
      hash=$(find "$real" -path "$real/node_modules" -prune -o -type f -printf '%P %s %T@\n' 2>/dev/null | sort | sha256sum | cut -c1-32)
      old=$(jq -c --arg p "$path" --arg h "$hash" '.[$p] | select(.hash == $h) | .code // empty' <<<"$prev")
      if [ -n "$old" ]; then code=$old; else code=$(code_scan "$home_real" "$rel" | jq -cs .); fi
      livef=$(live_scan "$n" "$path" | jq -cs .)
      findings=$(jq -cn --argjson a "$code" --argjson b "$livef" '$a + $b | .[]')
    fi
    code=${code:-[]}
    state=ok; [ -z "$findings" ] || state=blocked
    results=$(jq -c --arg p "$path" --arg s "$state" --arg h "$hash" --argjson c "$code" --argjson f "$(printf '%s\n' "$findings" | jq -cs 'map(select(. != null))')" --argjson at "$(date +%s)" '. + {($p): {state: $s, hash: $h, code: $c, findings: $f, at: $at}}' <<<"$results")
    unset code
    if [ "$state" = ok ]; then
      # Regex passt nur exakt auf diesen Pfad und alles darunter; "/" gilt für die ganze Subdomain.
      if [ "$path" = / ]; then printf '"~^%s\\.%s/" 1;\n' "$n" "$DOMAIN" >>"$new_map"; else printf '"~^%s\\.%s%s(/|$)" 1;\n' "$n" "$DOMAIN" "$path" >>"$new_map"; fi
    fi
  done < <(jq -r '.routes[]? | select(.public == true) | [.path, (.port|tostring), (.dir // "")] | @tsv' "$f" 2>/dev/null)
  printf '%s\n' "$results" >"$out.new"; chmod 644 "$out.new"; mv "$out.new" "$out"
done
sort -o "$new_map" "$new_map"
if ! cmp -s "$new_map" "$MAP_OUT"; then
  cp "$MAP_OUT" "$MAP_OUT.bak"; install -m 644 "$new_map" "$MAP_OUT"
  if docker exec bh-edge nginx -t >/dev/null 2>&1; then docker exec bh-edge nginx -s reload >/dev/null 2>&1; echo "Öffentliche Routen geändert: $(wc -l <"$MAP_OUT")"; else cp "$MAP_OUT.bak" "$MAP_OUT"; echo "nginx-Prüfung fehlgeschlagen, alte Liste bleibt" >&2; fi
fi
rm -f "$new_map"
