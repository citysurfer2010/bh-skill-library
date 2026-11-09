'use strict';
/** Verbindet den Browser per WebSocket mit einer tmux-Sitzung im eigenen Container. */
const { WebSocketServer } = require('ws');
const { currentUser } = require('./auth');
const { fromEdge } = require('./edge');
const { statusOf } = require('./workspace');
const { connect, sftpOf } = require('./ssh');
const { prepare, CONF, START_ROUTER } = require('./bootstrap');

const TAB = /^[a-z0-9]{1,12}$/;
const HIGH_WATER = 1 << 20;
const size = (v, fallback, max) => { const n = parseInt(v, 10); return n > 0 && n <= max ? n : fallback; };
const readyDone = new Set();

function identify(req) {
  req.get = (h) => req.headers[h.toLowerCase()];
  let user = null;
  currentUser(req, {}, () => { user = req.user; });
  return user;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return process.env.NODE_ENV !== 'production';
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
const refuse = (socket, code) => { socket.write(`HTTP/1.1 ${code} Refused\r\nConnection: close\r\n\r\n`); socket.destroy(); };

async function stillLoggedIn(cookie, email) {
  const base = process.env.BH_AUTH_URL;
  if (!base) return true;
  try {
    const r = await fetch(`${base}/validate`, { headers: { cookie: cookie || '' }, signal: AbortSignal.timeout(5000) });
    if (r.status === 401) return false;
    if (!r.ok) return true;
    return String((await r.json()).email).toLowerCase() === email;
  } catch { return true; } // Ein Ausfall der Anmeldung beendet keine laufende Arbeit.
}

async function bridge(ws, req, user, name, tab, cols, rows) {
  const conn = await connect(name);
  if (!readyDone.has(name)) { await prepare(await sftpOf(conn)); readyDone.add(name); }
  conn.exec(START_ROUTER, (e, s) => { if (!e) s.on('data', () => {}).resume(); });
  const cmd = `exec tmux -u -f ${CONF} new-session -A -s web-${tab} -c /home/dev`;
  const stream = await new Promise((ok, no) => conn.exec(cmd, { pty: { term: 'xterm-256color', cols, rows } }, (e, s) => (e ? no(e) : ok(s))));
  const close = () => { clearInterval(ping); clearInterval(check); try { conn.end(); } catch { /* schon zu */ } try { ws.close(); } catch { /* schon zu */ } };
  stream.on('data', (d) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(d);
    if (ws.bufferedAmount > HIGH_WATER) { stream.pause(); const t = setInterval(() => { if (ws.bufferedAmount < HIGH_WATER / 2 || ws.readyState !== ws.OPEN) { clearInterval(t); stream.resume(); } }, 30); }
  });
  stream.stderr.on('data', (d) => { if (ws.readyState === ws.OPEN) ws.send(d); });
  stream.on('close', close);
  ws.on('close', close);
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'i' && typeof m.d === 'string') stream.write(m.d);
    else if (m.t === 'r') stream.setWindow(size(m.r, rows, 500), size(m.c, cols, 1000), 0, 0);
    else if (m.t === 'k') conn.exec(`tmux kill-session -t web-${tab}`, () => close());
  });
  let alive = true; ws.on('pong', () => { alive = true; });
  const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); return undefined; }, 30_000);
  // Wer sich abmeldet, verliert auch offene Terminals.
  const check = setInterval(async () => { if (!(await stillLoggedIn(req.headers.cookie, user.email))) ws.close(4401, 'abgemeldet'); }, 300_000);
}

function attach(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return refuse(socket, 404);
    if (!fromEdge(req.headers) || !sameOrigin(req)) return refuse(socket, 403);
    const user = identify(req);
    if (!user) return refuse(socket, 401);
    const tab = url.searchParams.get('s') || '';
    const { state, name } = statusOf(user.email);
    if (!TAB.test(tab)) return refuse(socket, 400);
    if (state !== 'ready') return refuse(socket, 409);
    return wss.handleUpgrade(req, socket, head, (ws) => {
      bridge(ws, req, user, name, tab, size(url.searchParams.get('c'), 100, 1000), size(url.searchParams.get('r'), 30, 500)).catch((e) => {
        console.error(`[terminal] ${name}: ${e.message}`);
        try { ws.close(4500, 'Verbindung fehlgeschlagen'); } catch { /* schon zu */ }
      });
    });
  });
}

module.exports = { attach, sameOrigin, TAB };
