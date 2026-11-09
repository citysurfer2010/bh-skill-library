'use strict';
/** The face index. Lives only on this server, readable by the gateway alone. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS album (path TEXT PRIMARY KEY, name TEXT NOT NULL, sort TEXT NOT NULL, mtime INTEGER, scanned_mtime INTEGER);
CREATE TABLE IF NOT EXISTS photo (path TEXT PRIMARY KEY, album TEXT NOT NULL, size INTEGER NOT NULL, mtime INTEGER, status TEXT NOT NULL DEFAULT 'pending', face_count INTEGER);
CREATE INDEX IF NOT EXISTS photo_status ON photo(status);
CREATE INDEX IF NOT EXISTS photo_size ON photo(size);
CREATE TABLE IF NOT EXISTS face (id INTEGER PRIMARY KEY, photo TEXT NOT NULL REFERENCES photo(path), box TEXT NOT NULL, score REAL, sharpness REAL, fingerprint BLOB NOT NULL, crop BLOB);
CREATE INDEX IF NOT EXISTS face_photo ON face(photo);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`;

let db = null;

function open() {
  if (db) return db;
  const file = process.env.BH_FACES_DB || path.join(process.env.BH_FAMILY_DIR, 'faces.db');
  db = new DatabaseSync(file);
  try { fs.chmodSync(file, 0o600); } catch { /* the directory already restricts access */ }
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(SCHEMA);
  return db;
}
const close = () => { if (db) db.close(); db = null; };

const getMeta = (key) => open().prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
const setMeta = (key, value) => open().prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

function upsertAlbum(a) {
  open().prepare('INSERT INTO album(path, name, sort, mtime) VALUES(?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime').run(a.path, a.name, a.sort, a.mtime);
}
const nextAlbum = () => open().prepare('SELECT * FROM album WHERE scanned_mtime IS NULL OR scanned_mtime <> mtime ORDER BY sort DESC LIMIT 1').get() || null;
const markScanned = (album) => open().prepare('UPDATE album SET scanned_mtime = ? WHERE path = ?').run(album.mtime, album.path);

/** A copy with the same byte size elsewhere is recorded but not analysed twice. */
function addPhoto(albumPath, f) {
  const d = open();
  if (d.prepare('SELECT 1 FROM photo WHERE path = ?').get(f.path)) return false;
  const twin = d.prepare("SELECT 1 FROM photo WHERE size = ? AND status <> 'duplicate' LIMIT 1").get(f.additional.size);
  d.prepare('INSERT INTO photo(path, album, size, mtime, status) VALUES(?, ?, ?, ?, ?)').run(f.path, albumPath, f.additional.size, f.additional.time?.mtime || null, twin ? 'duplicate' : 'pending');
  return !twin;
}
const nextPending = () => open().prepare("SELECT p.* FROM photo p JOIN album a ON a.path = p.album WHERE p.status = 'pending' ORDER BY a.sort DESC, p.path LIMIT 1").get() || null;
const markPhoto = (p, status, count = null) => open().prepare('UPDATE photo SET status = ?, face_count = ? WHERE path = ?').run(status, count, p);

function saveFaces(photoPath, faces) {
  const d = open();
  const insert = d.prepare('INSERT INTO face(photo, box, score, sharpness, fingerprint, crop) VALUES(?, ?, ?, ?, ?, ?)');
  d.exec('BEGIN');
  try {
    for (const f of faces) insert.run(photoPath, JSON.stringify(f.box), f.score, f.sharpness, Buffer.from(f.fingerprint, 'base64'), f.crop ? Buffer.from(f.crop, 'base64') : null);
    d.prepare("UPDATE photo SET status = 'done', face_count = ? WHERE path = ?").run(faces.length, photoPath);
    d.exec('COMMIT');
  } catch (e) { d.exec('ROLLBACK'); throw e; }
}

function counts() {
  const d = open(); const out = { pending: 0, done: 0, duplicate: 0, error: 0 };
  for (const r of d.prepare('SELECT status, COUNT(*) n FROM photo GROUP BY status').all()) out[r.status] = r.n;
  return { photos: out, faces: d.prepare('SELECT COUNT(*) n FROM face').get().n, albumsOpen: d.prepare('SELECT COUNT(*) n FROM album WHERE scanned_mtime IS NULL OR scanned_mtime <> mtime').get().n, albums: d.prepare('SELECT COUNT(*) n FROM album').get().n };
}

module.exports = { open, close, getMeta, setMeta, upsertAlbum, nextAlbum, markScanned, addPhoto, nextPending, markPhoto, saveFaces, counts };
