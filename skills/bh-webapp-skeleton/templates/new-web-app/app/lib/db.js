'use strict';
/** SQLite via node:sqlite (no native build step). Migrations run idempotently at startup. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./config');

let db = null;

function migrate(conn) {
  conn.exec(`
    -- API-Keys externer Clients. Gespeichert wird nur der SHA-256-Hash, nie der Klartext.
    CREATE TABLE IF NOT EXISTS api_keys (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash     TEXT NOT NULL UNIQUE,
      key_prefix   TEXT NOT NULL,
      owner_id     TEXT NOT NULL,
      label        TEXT NOT NULL,
      scopes       TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id) WHERE revoked_at IS NULL;

    -- Eigene Tabellen der App hier ergänzen.
  `);
}

function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function closeDb() {
  if (db) db.close();
  db = null;
}

const nowIso = () => new Date().toISOString();

module.exports = { getDb, closeDb, nowIso, DB_PATH };
