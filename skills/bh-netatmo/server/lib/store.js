'use strict';
/** SQLite store of the Netatmo session. An older netatmo.json is taken over once and kept as *.imported. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dir = () => process.env.BH_FAMILY_DIR || '/tmp/bh-family';
const NUMBERS = new Set(['tokenUntil', 'lockedUntil', 'logins', 'resumes']);
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS session (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS cookies (name TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rooms_cache (id INTEGER PRIMARY KEY CHECK (id = 1), at INTEGER NOT NULL, data TEXT NOT NULL);`;

let handle = null;

function apply(d, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'cookies') {
      d.exec('DELETE FROM cookies');
      const insert = d.prepare('INSERT INTO cookies (name, value) VALUES (?, ?)');
      for (const [name, v] of Object.entries(value || {})) insert.run(name, String(v));
    } else if (key === 'state') {
      d.exec('DELETE FROM rooms_cache');
      if (value) d.prepare('INSERT INTO rooms_cache (id, at, data) VALUES (1, ?, ?)').run(value.at, JSON.stringify(value.data));
    } else {
      d.prepare('INSERT INTO session (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, String(value));
    }
  }
}

function inTransaction(d, work) {
  d.exec('BEGIN IMMEDIATE');
  try { work(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
}

function importLegacy(d) {
  const file = path.join(dir(), 'netatmo.json');
  let legacy;
  try { legacy = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  inTransaction(d, () => { if (!d.prepare('SELECT count(*) AS n FROM session').get().n) apply(d, legacy); });
  try { fs.renameSync(file, `${file}.imported`); } catch { /* another process was faster */ }
}

function db() {
  if (handle) return handle;
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), 'netatmo.db');
  fs.closeSync(fs.openSync(file, 'a', 0o600));
  handle = new DatabaseSync(file);
  handle.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  handle.exec(SCHEMA);
  importLegacy(handle);
  return handle;
}

function read() {
  const d = db(); const out = {};
  for (const { key, value } of d.prepare('SELECT key, value FROM session').all()) out[key] = NUMBERS.has(key) ? Number(value) : value;
  const cookies = d.prepare('SELECT name, value FROM cookies').all();
  if (cookies.length) out.cookies = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
  const cached = d.prepare('SELECT at, data FROM rooms_cache WHERE id = 1').get();
  if (cached) out.state = { at: cached.at, data: JSON.parse(cached.data) };
  return out;
}

function write(patch) { const d = db(); inTransaction(d, () => apply(d, patch)); }

function reset() {
  handle?.close(); handle = null;
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.join(dir(), `netatmo.db${suffix}`), { force: true });
}

module.exports = { read, write, reset };
