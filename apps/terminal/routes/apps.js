'use strict';
/** Die eigenen Apps: welcher Pfad auf der Subdomain zu welchem Port im Container gehört. */
const express = require('express');
const { statusOf, guardOf } = require('../lib/workspace');
const { withSftp } = require('../lib/ssh');
const { HOME } = require('../lib/bootstrap');

const FILE = `${HOME}/.config/bh-apps/routes.json`;
const DIR_OK = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const PATH_OK = /^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/;
const portOk = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535 && p !== 2222 && p !== 8088;
const load = (s) => new Promise((ok) => s.readFile(FILE, (e, b) => { try { ok(e ? [] : JSON.parse(b).routes || []); } catch { ok([]); } }));
const save = (s, routes) => new Promise((ok, no) => s.writeFile(FILE, JSON.stringify({ routes }, null, 2), (e) => (e ? no(e) : ok())));

// Welche Apps gerade laufen. Nur Zahlen gehen in den Befehl.
function openPorts(conn, list) {
  const ports = [...new Set(list.map((x) => x.port).filter(portOk))];
  if (!ports.length) return Promise.resolve(new Set());
  const cmd = `for p in ${ports.join(' ')}; do (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && echo $p; done`;
  return new Promise((ok) => {
    const done = (out) => ok(new Set(out.split(/\s+/).filter(Boolean).map(Number)));
    conn.exec(`bash -c '${cmd}'`, (e, stream) => {
      if (e) return done('');
      let out = ''; const t = setTimeout(() => done(out), 3000);
      stream.on('data', (d) => { out += d; }).on('close', () => { clearTimeout(t); done(out); }).stderr.resume();
      return undefined;
    });
  });
}

function buildRouter() {
  const r = express.Router();
  const ready = (req, res, next) => {
    const s = statusOf(req.user.email);
    if (s.state !== 'ready') return res.status(409).json({ error: 'Umgebung wird noch vorbereitet' });
    req.box = s; return next();
  };
  r.get('/apps', ready, async (req, res, next) => {
    try {
      const routes = await withSftp(req.box.name, async (s, conn) => { const list = await load(s); const up = await openPorts(conn, list); const guard = guardOf(req.box.name); return list.map((x) => ({ ...x, up: up.has(x.port), guard: guard[x.path] ? { state: guard[x.path].state, findings: guard[x.path].findings } : null })); });
      res.json({ subdomain: req.box.subdomain, routes });
    } catch (e) { next(e); }
  });
  r.post('/apps', ready, async (req, res, next) => {
    const { path, port } = req.body || {};
    if (!PATH_OK.test(String(path)) || !portOk(port)) return res.status(400).json({ error: 'Pfad wie /spiel und Port von 1024 bis 65535 angeben' });
    try {
      const routes = await withSftp(req.box.name, async (s) => { const next_ = (await load(s)).filter((x) => x.path !== path).concat({ path, port }); await save(s, next_); return next_; });
      return res.json({ routes });
    } catch (e) { return next(e); }
  });
  // Öffentlich schalten fordert nur die Prüfung an; freigeben kann allein der Wächter auf dem Server.
  r.post('/apps/public', ready, async (req, res, next) => {
    const { path, dir, on } = req.body || {};
    if (!PATH_OK.test(String(path))) return res.status(400).json({ error: 'Ungültiger Pfad' });
    const folder = String(dir || '').replace(/^~\//, '').replace(/^\/home\/dev\//, '').replace(/\/+$/, '');
    if (on && (!DIR_OK.test(folder) || folder.split('/').includes('..'))) return res.status(400).json({ error: 'Ordner wie projects/spiel angeben' });
    try {
      await withSftp(req.box.name, async (s) => {
        const list = (await load(s)).map((x) => { if (x.path !== path) return x; const { public: _p, dir: _d, ...rest } = x; return on ? { ...rest, public: true, dir: folder } : rest; });
        await save(s, list);
      });
      return res.json({ ok: true });
    } catch (e) { return next(e); }
  });
  r.delete('/apps', ready, async (req, res, next) => {
    try {
      const routes = await withSftp(req.box.name, async (s) => { const next_ = (await load(s)).filter((x) => x.path !== req.query.path); await save(s, next_); return next_; });
      res.json({ routes });
    } catch (e) { next(e); }
  });
  return r;
}
module.exports = { buildRouter, PATH_OK, DIR_OK, portOk };
