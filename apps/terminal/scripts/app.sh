#!/usr/bin/env bash
# Start and stop Terminal: scripts/app.sh start|stop|restart|status
# "start" is idempotent. PORT and DATA_DIR come from the environment, else from .env, else from the default.
set -u
cd "$(dirname "$0")/.." || exit 1

from_env_file() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -1; }
PORT=${PORT:-$(from_env_file PORT)}; PORT=${PORT:-3400}
DATA_DIR=${DATA_DIR:-$(from_env_file DATA_DIR)}; DATA_DIR=${DATA_DIR:-$PWD/data}
export PORT DATA_DIR
PID_FILE="$DATA_DIR/app.pid"
LOG_FILE="$DATA_DIR/app.log"

healthy() {
  node -e "fetch('http://127.0.0.1:$PORT/health',{signal:AbortSignal.timeout(2000)}).then(r=>r.json()).then(j=>process.exit(j.skill==='terminal'?0:1),()=>process.exit(1))"
}

# Only our own process: after a restart a PID may belong to something else.
our_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid; pid=$(cat "$PID_FILE")
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && grep -qa 'server.js' "/proc/$pid/cmdline" && echo "$pid"
}

start() {
  if healthy; then echo "terminal läuft bereits auf Port $PORT"; return 0; fi
  mkdir -p "$DATA_DIR"
  nohup node --disable-warning=ExperimentalWarning --env-file-if-exists=.env server.js >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  for _ in $(seq 1 30); do
    if healthy; then echo "terminal gestartet auf Port $PORT"; return 0; fi
    sleep 0.5
  done
  echo "FEHLER: terminal kommt nicht hoch. Log:" >&2
  tail -20 "$LOG_FILE" >&2
  return 1
}

stop() {
  local pid; pid=$(our_pid) || { echo "terminal läuft nicht"; rm -f "$PID_FILE"; return 0; }
  kill "$pid"
  for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
  rm -f "$PID_FILE"
  echo "terminal gestoppt"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop && start ;;
  status) if healthy; then echo "terminal läuft auf Port $PORT"; else echo "terminal läuft nicht"; exit 1; fi ;;
  *) echo "Aufruf: scripts/app.sh start|stop|restart|status" >&2; exit 2 ;;
esac
