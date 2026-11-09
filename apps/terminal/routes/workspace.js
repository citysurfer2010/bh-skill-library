'use strict';
/** Workspace status, images and files in the uploads folder of the user's own container. */
const express = require('express');
const multer = require('multer');
const { statusOf } = require('../lib/workspace');
const { withSftp } = require('../lib/ssh');
const { HOME } = require('../lib/bootstrap');

const MAX_BYTES = 25 * 1024 * 1024; const DIR = `${HOME}/uploads`;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 2 } });
const SAFE = /^[A-Za-z0-9._-]{1,120}$/;
const ext = (n) => n.split('.').pop().toLowerCase();

function safeName(original) {
  const base = String(original || 'datei').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(-80);
  return `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${base || 'datei'}`;
}

function buildRouter() {
  const r = express.Router();
  const ready = (req, res, next) => {
    const s = statusOf(req.user.email);
    if (s.state !== 'ready') return res.status(409).json({ error: 'Umgebung wird noch vorbereitet' });
    req.box = s.name; return next();
  };
  const name = (req, res, next) => (SAFE.test(req.params.name) ? next() : res.status(400).json({ error: 'Ungültiger Name' }));

  r.get('/status', (req, res) => res.json(statusOf(req.user.email)));

  r.post('/upload', ready, upload.array('file', 2), async (req, res, next) => {
    try {
      const saved = await withSftp(req.box, async (s) => Promise.all((req.files || []).map((f) => new Promise((ok, no) => {
        const file = safeName(f.originalname);
        s.writeFile(`${DIR}/${file}`, f.buffer, (e) => (e ? no(e) : ok({ name: file, path: `${DIR}/${file}`, image: !!TYPES[ext(file)] })));
      }))));
      res.json({ files: saved });
    } catch (e) { next(e); }
  });

  r.get('/files', ready, async (req, res, next) => {
    try {
      const list = await withSftp(req.box, (s) => new Promise((ok, no) => s.readdir(DIR, (e, l) => (e ? no(e) : ok(l)))));
      res.json({ files: list.filter((f) => SAFE.test(f.filename) && f.attrs.isFile()).map((f) => ({ name: f.filename, path: `${DIR}/${f.filename}`, size: f.attrs.size, at: f.attrs.mtime, image: !!TYPES[ext(f.filename)] })).sort((a, b) => b.at - a.at).slice(0, 60) });
    } catch (e) { next(e); }
  });

  // Only real image types, never SVG: user content must not execute scripts here.
  r.get('/files/:name', ready, name, async (req, res, next) => {
    const type = TYPES[ext(req.params.name)];
    if (!type) return res.status(415).json({ error: 'Kein Bild' });
    try {
      const data = await withSftp(req.box, (s) => new Promise((ok, no) => s.readFile(`${DIR}/${req.params.name}`, (e, b) => (e ? no(e) : ok(b)))));
      res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=60' }).send(data);
    } catch (e) { if (e.code === 2) return res.status(404).json({ error: 'Nicht gefunden' }); return next(e); }
    return undefined;
  });

  r.delete('/files/:name', ready, name, async (req, res, next) => {
    try {
      await withSftp(req.box, (s) => new Promise((ok, no) => s.unlink(`${DIR}/${req.params.name}`, (e) => (e && e.code !== 2 ? no(e) : ok()))));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.use((err, _req, res, next) => (err instanceof multer.MulterError ? res.status(413).json({ error: 'Datei zu groß (höchstens 25 MB)' }) : next(err)));
  return r;
}

module.exports = { buildRouter, safeName };
