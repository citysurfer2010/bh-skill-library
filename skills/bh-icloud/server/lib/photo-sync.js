'use strict';
/** Moves downloaded iCloud photos to one fixed Synology folder, one file per step, and never overwrites anything there. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { upload } = require('../../../bh-nas/server/lib/dsm.js');

const TARGET_ROOT = '/photo/iCloud-Matti';
const RELATIVE = /^\d{4}\/\d{4}-\d{2}\/[^/]+$/;
const MAX_BYTES = 4 * 1024 ** 3;
const KEEP_LOCAL = 700; // the download skips files it still finds here
const keepBytes = () => Number(process.env.BH_ICLOUD_KEEP_BYTES) || 12 * 1024 ** 3; // videos: the VPS disk is small
const ALREADY_THERE = new Set([414, 1805]);

const inbox = () => process.env.BH_ICLOUD_INBOX;
// Touching this file stops all background work on the Synology, e.g. while it recovers from an update.
const nasPaused = () => fs.existsSync(path.join(process.env.BH_FAMILY_DIR || '/nonexistent', 'nas-pause'));
let db = null;
function state() {
  if (db) return db;
  const file = process.env.BH_ICLOUD_SYNC_DB || path.join(process.env.BH_FAMILY_DIR, 'icloud-uploads.db');
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS upload (rel TEXT PRIMARY KEY, status TEXT NOT NULL, at INTEGER NOT NULL);');
  return db;
}
const close = () => { if (db) db.close(); db = null; };
const mark = (rel, status) => state().prepare('INSERT INTO upload(rel, status, at) VALUES(?, ?, ?) ON CONFLICT(rel) DO UPDATE SET status = excluded.status, at = excluded.at').run(rel, status, Date.now());
const known = () => new Set(state().prepare('SELECT rel FROM upload').all().map((r) => r.rel));

function localFiles() {
  const root = inbox(); const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (!e.name.startsWith('.') && !e.name.endsWith('.part')) { const rel = path.relative(root, full).split(path.sep).join('/'); if (RELATIVE.test(rel)) out.push({ rel, full, mtime: fs.statSync(full).mtimeMs }); }
    }
  };
  walk(root);
  return out;
}

/** Old files can go once uploaded; the newest stay so the daily download recognises them. */
function prune(files) {
  const uploaded = new Set(state().prepare("SELECT rel FROM upload WHERE status IN ('uploaded', 'existed')").all().map((r) => r.rel));
  let removed = 0; let kept = 0; let bytes = 0;
  for (const f of files.sort((a, b) => b.mtime - a.mtime)) {
    const size = fs.statSync(f.full).size;
    if (kept < KEEP_LOCAL && bytes + size <= keepBytes()) { kept++; bytes += size; continue; }
    if (uploaded.has(f.rel)) { fs.rmSync(f.full); removed++; }
  }
  return removed;
}

async function step() {
  if (nasPaused()) return { paused: true };
  const files = localFiles(); const seen = known();
  const next = files.find((f) => !seen.has(f.rel));
  if (!next) return { done: true, removedLocal: prune(files) };
  if (fs.statSync(next.full).size > MAX_BYTES) { mark(next.rel, 'too_large'); return { skipped: true }; }
  const r = await upload(`${TARGET_ROOT}/${path.posix.dirname(next.rel)}`, path.posix.basename(next.rel), { path: next.full, size: fs.statSync(next.full).size });
  if (r.success) { mark(next.rel, 'uploaded'); return { uploaded: true }; }
  if (ALREADY_THERE.has(r.error?.code)) { mark(next.rel, 'existed'); return { existed: true }; }
  throw new Error(`Synology lehnt den Upload ab (${r.error?.code})`);
}

function counts() {
  const by = Object.fromEntries(state().prepare('SELECT status, COUNT(*) n FROM upload GROUP BY status').all().map((r) => [r.status, r.n]));
  const files = localFiles(); const seen = known();
  return { local: files.length, open: files.filter((f) => !seen.has(f.rel)).length, ...by };
}

module.exports = { step, counts, close };
