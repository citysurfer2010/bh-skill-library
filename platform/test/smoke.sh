#!/usr/bin/env bash
# Prueft von aussen: Login, opencode, Datenerhalt und vor allem die Grenzen.
# Legt zwei Wegwerf-User an und raeumt sie wieder ab.
# Aufruf: smoke.sh <admin-ssh-key> <host>
ADMIN_KEY=$1; HOST=${2:?Server-Adresse fehlt}
T=$(mktemp -d); trap 'admin "docker rm -f gw-test; devbox remove smoke-a --purge; devbox remove smoke-b --purge" >/dev/null 2>&1; rm -rf "$T"' EXIT
OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o IdentitiesOnly=yes"
admin() { ssh $OPTS -i "$ADMIN_KEY" "root@$HOST" "$@"; }
PASS=0; FAIL=0
ok() { echo "  ok    $1"; PASS=$((PASS + 1)); }
bad() { echo "  FEHL  $1 ${2:+[$2]}"; FAIL=$((FAIL + 1)); }
# expect <beschreibung> <erwarteter exit 0=erfolg/1=fehlschlag> <befehl...>
expect() { local d=$1 w=$2; shift 2; if "$@" >"$T/out" 2>&1; then r=0; else r=1; fi; [ $r = "$w" ] && ok "$d" || bad "$d" "$(head -c 200 "$T/out")"; }

ssh-keygen -q -t ed25519 -N '' -f "$T/a"; ssh-keygen -q -t ed25519 -N '' -f "$T/b"; ssh-keygen -q -t ed25519 -N '' -f "$T/x"
scp -q $OPTS -i "$ADMIN_KEY" "$T/a.pub" "$T/b.pub" "root@$HOST:/tmp/" || exit 2
admin "devbox add smoke-a /tmp/a.pub && devbox add smoke-b /tmp/b.pub; rm -f /tmp/a.pub /tmp/b.pub"
PA=$(admin cat /srv/devbox/users/smoke-a/port); PB=$(admin cat /srv/devbox/users/smoke-b/port)
sleep 3
A() { ssh $OPTS -i "$T/a" -p "$PA" "dev@$HOST" "$@"; }
tcp() { echo "timeout 4 bash -c '</dev/tcp/$1/$2'"; }

echo "Zugang"
expect "Login mit eigenem Schluessel" 0 A true
expect "PTY-Terminal" 0 ssh -tt $OPTS -i "$T/a" -p "$PA" "dev@$HOST" 'tty | grep -q pts'
expect "fremder Schluessel abgewiesen" 1 ssh $OPTS -i "$T/x" -p "$PA" "dev@$HOST" true
expect "Schluessel von User B gilt nicht bei A" 1 ssh $OPTS -i "$T/b" -p "$PA" "dev@$HOST" true
expect "User-Schluessel kommt nicht auf den VPS (root)" 1 ssh $OPTS -i "$T/a" "root@$HOST" true
expect "User-Schluessel kommt nicht auf den VPS (dev)" 1 ssh $OPTS -i "$T/a" "dev@$HOST" true
expect "Passwort-Login abgeschaltet" 1 ssh -o BatchMode=yes -o PreferredAuthentications=password -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p "$PA" "dev@$HOST" true

echo "Werkzeuge"
expect "opencode startet" 0 A 'bash -lc "opencode --version"'
expect "git/node/python da" 0 A 'git --version && node -v && python3 -V'

echo "Rechte"
expect "laeuft als uid 1000" 0 A 'test "$(id -u)" = 1000'
expect "keine Capabilities" 0 A 'grep -q "CapEff:.0000000000000000" /proc/self/status'
expect "NoNewPrivs aktiv" 0 A 'grep -q "NoNewPrivs:.1" /proc/self/status'
expect "kein sudo/su-Weg" 1 A 'command -v sudo || test -u "$(command -v su)"'
expect "keine setuid-Dateien" 0 A 'test -z "$(find / -xdev -type f -perm /6000 2>/dev/null | head -1)"'
expect "Root-Dateisystem schreibgeschuetzt" 1 A 'touch /usr/x'
expect "kein Docker-Socket" 1 A 'test -e /var/run/docker.sock'
expect "authorized_keys nicht aenderbar" 1 A 'echo x >>/etc/devbox/ssh/authorized_keys'
expect "Home-Grenze 10 G" 0 A 'df -BG --output=size /home/dev | tail -1 | grep -qE " ?(9|10)G"'
expect "Host sieht Prozess als unprivilegiert" 0 admin 'ps -eo uid,cmd | grep "[s]shd.*devbox" | awk "{print \$1}" | sort -u | grep -qx 101000'

echo "Netz"
HOST_GW=$(admin "docker network inspect devbox-net-smoke-a -f '{{(index .IPAM.Config 0).Gateway}}'")
IP_B=$(admin "docker inspect devbox-smoke-b -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'")
expect "Internet erreichbar (DNS + HTTPS)" 0 A 'curl -fsS -m 10 -o /dev/null https://registry.npmjs.org/'
expect "Host-SSH ueber Bridge gesperrt" 1 A "$(tcp "$HOST_GW" 22)"
expect "Host-SSH ueber oeffentliche IP gesperrt" 1 A "$(tcp "$HOST" 22)"
expect "Metadaten-Dienst gesperrt" 1 A "$(tcp 169.254.169.254 80)"
expect "anderer Container direkt gesperrt" 1 A "$(tcp "$IP_B" 2222)"
expect "anderer Container ueber oeffentlichen Port gesperrt" 1 A "$(tcp "$HOST" "$PB")"
expect "SMTP gesperrt" 1 A "$(tcp smtp.gmail.com 587)"

admin "docker run -d --name gw-test --network devbox-net-smoke-a --entrypoint python3 devbox:current -m http.server 18790 >/dev/null; docker network connect devbox-net-smoke-b gw-test"
sleep 3
expect "gemeinsamer Dienst (Gateway-Modell) erreichbar" 0 A "$(tcp gw-test 18790)"

echo "Datenerhalt"
A 'echo erhalten >/home/dev/projects/marker'
admin 'devbox recreate smoke-a' >/dev/null; sleep 3
expect "Home ueberlebt Neubau" 0 A 'grep -q erhalten /home/dev/projects/marker'
expect "Platten-Grenze greift" 1 A 'fallocate -l 11G /home/dev/gross'

echo; echo "Ergebnis: $PASS ok, $FAIL fehlgeschlagen"
[ "$FAIL" = 0 ]
