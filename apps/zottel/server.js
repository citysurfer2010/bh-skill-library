#!/usr/bin/env node
'use strict';
/**
 * Zottel — web app. Port 3060, path "/zottel".
 * Login: lib/auth.js (headers from the BH auth proxy, locally DEV_USER_EMAIL). Locally the app listens only on 127.0.0.1.
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
const chatRoutes = require('./routes/chat');

const APP_BASE = '/zottel';
const APP_ID = 'zottel';
const PORT = parseInt(process.env.PORT || '3060', 10);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const ADMIN_HTML = path.join(PUBLIC_DIR, 'admin.html');

// New on every process start: the cache buster invalidates old assets after a deploy.
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

// Bearer API for external clients, own check via API key, hence before the user check.
app.use('/api/external', externalRoutes.buildRouter());

app.use(currentUser);
app.use((req, res, next) => (worksWithoutUser(req.path) ? next() : requireUser(req, res, next)));

// Before express.static, otherwise admin.html would be reachable without a role check.
app.get(['/admin', '/admin/', '/admin.html'], requireRole('admin'), (_req, res) => sendPage(res, ADMIN_HTML));

// index:false so that GET / goes through sendPage with cache busters.
app.use(express.static(PUBLIC_DIR, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// Every view is a real path.
app.get(['/', '/c/:id', '/memory'], (_req, res) => sendPage(res, INDEX_HTML));

app.get('/api/me', (req, res) => {
  const { email, name, role } = req.user;
  res.json({ id: email, email, name, role });
});
app.use('/api/me/api-keys', apiKeyRoutes.buildRouter());
app.use('/api', chatRoutes.buildRouter());

app.use(errorPage.notFound);
app.use(errorPage.errorHandler);

if (require.main === module) {
  getDb();
  // Routines: one look per minute is precise enough and costs nothing when none is due.
  setInterval(() => require('./lib/agent').runRoutines().catch((e) => console.error(`[zottel] ${e.message}`)), 60_000).unref();
  const server = app.listen(PORT, HOST, () => console.log(`[${APP_ID}] läuft auf http://${HOST}:${PORT} (Pfad: "${APP_BASE}")`));
  const stop = () => server.close(() => { closeDb(); process.exit(0); });
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = app;
