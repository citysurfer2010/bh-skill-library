'use strict';
/** SQLite store of the family data. Older JSON files are taken over once and kept as *.imported. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dir = () => process.env.BH_FAMILY_DIR || '/tmp/bh-family';
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS birthdays (name TEXT PRIMARY KEY, date TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_birthdays_month_day ON birthdays (substr(date, 6));
  CREATE TABLE IF NOT EXISTS on_this_day (date TEXT PRIMARY KEY, born_year INTEGER, born_text TEXT);
  CREATE TABLE IF NOT EXISTS on_this_day_fact (
    date TEXT NOT NULL REFERENCES on_this_day (date) ON DELETE CASCADE,
    position INTEGER NOT NULL, year INTEGER NOT NULL, text TEXT NOT NULL,
    PRIMARY KEY (date, position)
  );`;

let handle = null;

function transaction(d, work) {
  d.exec('BEGIN IMMEDIATE');
  try { const result = work(); d.exec('COMMIT'); return result; } catch (e) { d.exec('ROLLBACK'); throw e; }
}

function importLegacy(d) {
  const file = path.join(dir(), 'birthdays.json');
  let list;
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  transaction(d, () => {
    if (d.prepare('SELECT count(*) AS n FROM birthdays').get().n) return;
    const insert = d.prepare('INSERT OR IGNORE INTO birthdays (name, date) VALUES (?, ?)');
    for (const b of list) insert.run(b.name, b.date);
  });
  try { fs.renameSync(file, `${file}.imported`); } catch { /* another process was faster */ }
}

function db() {
  if (handle) return handle;
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), 'birthdays.db');
  fs.closeSync(fs.openSync(file, 'a', 0o600));
  handle = new DatabaseSync(file);
  // Several per-user tool processes share this file.
  handle.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  handle.exec(SCHEMA);
  importLegacy(handle);
  fs.rmSync(path.join(dir(), 'on-this-day.json'), { force: true }); // Only a daily cache.
  return handle;
}

function reset() { handle?.close(); handle = null; }

module.exports = { db, transaction, reset };
