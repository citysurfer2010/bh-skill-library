#!/usr/bin/env node
'use strict';
/**
 * Beamer — Web-App. Port 3310, Pfad "/beamer".
 * Anmeldung: lib/auth.js (Kopfzeilen des BH-Auth-Proxys, lokal DEV_USER_EMAIL). Lokal lauscht die App nur auf 127.0.0.1.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const { getDb, closeDb } = require('./lib/db');
const { currentUser, requireUser, requireRole } = require('./lib/auth');
const assets = require('./lib/assets');
const errorPage = require('./lib/error-page');
const externalRoutes = require('./routes/external');
const apiKeyRoutes = require('./routes/api-keys');
const beamerRoutes = require('./routes/beamer');

const APP_BASE = '/beamer';
const APP_ID = 'beamer';
const PORT = parseInt(process.env.PORT || '3310', 10);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const ADMIN_HTML = path.join(PUBLIC_DIR, 'admin.html');

// Neu bei jedem Prozess-Start: Der Cache-Buster macht alte Assets nach einem Deploy ungültig.
const BUILD_ID = Date.now().toString(36);
const LOCAL_ASSET_RE = new RegExp(`(\\s(?:src|href))="(${APP_BASE}/[^"?]+\\.(?:js|css))"`, 'g');

function sendPage(res, htmlPath) {
  const rendered = fs.readFileSync(htmlPath, 'utf8').replace(LOCAL_ASSET_RE, (_m, attr, url) => `${attr}="${url}?v=${BUILD_ID}"`);
  res.set('Cache-Control', 'no-store, must-revalidate');
  res.type('html').send(rendered);
}

function sendBundle(type, body) {
  return (_req, res) => {
    res.set('Content-Type', `${type}; charset=utf-8`);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(body);
  };
}

const worksWithoutUser = (p) => p === '/favicon.svg' || p === '/manifest.webmanifest' || p.startsWith('/branding/');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', skill: APP_ID, version: require('./package.json').version }));
app.get('/api/build-id', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ buildId: BUILD_ID });
});
app.get('/bh-styles.css', sendBundle('text/css', assets.DESIGN_CSS));
app.get('/app.css', sendBundle('text/css', assets.APP_CSS));
app.get('/app.js', sendBundle('application/javascript', assets.APP_JS));
app.get('/build-version-check.js', (_req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(fs.readFileSync(path.join(PUBLIC_DIR, 'build-version-check.js'), 'utf8'));
});

// Bearer-API für externe Clients, eigene Prüfung per API-Key, deshalb vor der Benutzer-Prüfung.
app.use('/api/external', externalRoutes.buildRouter());

app.use(currentUser);
app.use((req, res, next) => (worksWithoutUser(req.path) ? next() : requireUser(req, res, next)));

// Vor express.static, sonst wäre admin.html ohne Rollenprüfung erreichbar.
app.get(['/admin', '/admin/', '/admin.html'], requireRole('admin'), (_req, res) => sendPage(res, ADMIN_HTML));

// index:false, damit GET / über sendPage mit Cache-Bustern läuft.
app.use(express.static(PUBLIC_DIR, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// Jede Ansicht ist ein echter Pfad.
app.get('/', (_req, res) => sendPage(res, INDEX_HTML));

app.get('/api/me', (req, res) => {
  const { email, name, role } = req.user;
  res.json({ id: email, email, name, role });
});
app.use('/api/me/api-keys', apiKeyRoutes.buildRouter());
const beamer = beamerRoutes.buildRouter();
app.use('/api', beamer);

app.use(errorPage.notFound);
app.use(errorPage.errorHandler);

if (require.main === module) {
  getDb();
  require('./lib/menu-bridge').start(beamer.commands);
  const server = app.listen(PORT, HOST, () => console.log(`[${APP_ID}] läuft auf http://${HOST}:${PORT} (Pfad: "${APP_BASE}")`));
  const stop = () => server.close(() => { closeDb(); process.exit(0); });
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = app;
