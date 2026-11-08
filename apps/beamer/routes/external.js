'use strict';
/**
 * /api/external/*: Bearer-API für externe Clients. Auth: `Authorization: Bearer bhbea_<key>`.
 * Keys entstehen über POST /api/me/api-keys. Die Platzhalter unten durch das eigene Modell ersetzen,
 * Middleware und Scope-Prüfung für jeden neuen Endpoint beibehalten.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const apiKeys = require('../lib/api-keys');
const { UPLOADS_DIR } = require('../lib/config');

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 8).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, crypto.randomBytes(10).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_BYTES }, fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME.has(file.mimetype)) });

function requireApiKey(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(\S+)$/);
  if (!m) return res.status(401).json({ error: 'Missing Bearer token' });
  const row = apiKeys.verify(m[1]);
  if (!row) return res.status(401).json({ error: 'Invalid or revoked API key' });
  req.apiKeyId = row.id;
  req.apiUserId = row.owner_id;
  req.apiScopes = new Set((row.scopes || '').split(',').map((s) => s.trim()).filter(Boolean));
  return next();
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiScopes || !req.apiScopes.has(scope)) return res.status(403).json({ error: `Missing scope: ${scope}` });
    return next();
  };
}

function buildRouter() {
  const router = express.Router();
  router.use(requireApiKey);

  router.post('/submit', requireScope('submit'), (req, res) => {
    res.status(201).json({ ok: true, note: 'Externe API ist verdrahtet, hier die eigene Logik einsetzen.', submitted_by: req.apiUserId });
  });

  router.get('/records', requireScope('read'), (_req, res) => res.json({ records: [] }));

  router.post('/records/:id/upload', requireScope('submit'), upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file missing or not allowed type' });
    return res.status(201).json({
      ok: true,
      attachment: { filename: req.file.originalname, size_bytes: req.file.size, mime: req.file.mimetype, storedAs: req.file.filename },
    });
  });

  return router;
}

module.exports = { buildRouter, requireApiKey, requireScope };
