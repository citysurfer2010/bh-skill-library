#!/usr/bin/env node
// Routes the user's subdomain to their apps: path -> port, maintained with bh-route or in the web terminal.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.env.HOME, '.config/bh-apps/routes.json');
const PORT = 8088;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Path tricks like /privat/../spiel would bypass the approval at the web entry point.
const unsafe = (url) => /(^|\/)\.\.(\/|$)|%2e|%2f|%5c|\\/i.test(url.split('?')[0]);
function routes() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).routes.filter((r) => /^\/[a-z0-9-/]*$/.test(r.path) && r.port > 0).sort((a, b) => b.path.length - a.path.length); } catch { return []; }
}
function match(url) {
  const pathname = url.split('?')[0];
  return routes().find((r) => r.path === '/' || pathname === r.path || pathname.startsWith(`${r.path}/`));
}
const target = (r, url) => (r.path === '/' ? url : url.slice(r.path.length) || '/').replace(/^(?!\/)/, '/');
const headers = (req, r) => ({ ...req.headers, 'x-forwarded-prefix': r.path === '/' ? '' : r.path });

function landing(res) {
  const list = routes().map((r) => `<li><a href="${esc(r.path)}">${esc(r.path)}</a></li>`).join('');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Meine Apps</title><body style="font:18px system-ui;margin:48px"><h1>Meine Apps</h1>${list ? `<ul>${list}</ul>` : '<p>Noch keine App eingetragen. Im Terminal: <code>bh-route add /spiel 3001</code></p>'}</body>`);
}

const server = http.createServer((req, res) => {
  if (unsafe(req.url)) { res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Ungültiger Pfad.'); }
  const r = match(req.url);
  if (!r) { if (req.url.split('?')[0] === '/') return landing(res); res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Keine App unter diesem Pfad.'); }
  const up = http.request({ host: '127.0.0.1', port: r.port, path: target(r, req.url), method: req.method, headers: headers(req, r) }, (a) => { res.writeHead(a.statusCode, a.headers); a.pipe(res); });
  up.on('error', () => { if (!res.headersSent) { res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }); } res.end(`Die App auf Port ${r.port} läuft gerade nicht.`); });
  req.pipe(up);
  return undefined;
});

server.on('upgrade', (req, socket, head) => {
  const r = unsafe(req.url) ? null : match(req.url);
  if (!r) return socket.destroy();
  const up = net.connect(r.port, '127.0.0.1', () => {
    const lines = Object.entries(headers(req, r)).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    up.write(`${req.method} ${target(r, req.url)} HTTP/1.1\r\n${lines}\r\n\r\n`); up.write(head); up.pipe(socket); socket.pipe(up);
  });
  up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy());
  return undefined;
});
if (process.argv[1] === new URL(import.meta.url).pathname) server.listen(PORT, '0.0.0.0');
export { server, match, target, unsafe };
