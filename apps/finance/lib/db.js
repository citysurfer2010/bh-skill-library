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

    CREATE TABLE IF NOT EXISTS categories (
      code TEXT PRIMARY KEY, art TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', budget_cents INTEGER
    );
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, format TEXT NOT NULL, account TEXT NOT NULL,
      rows INTEGER NOT NULL, added INTEGER NOT NULL, duplicates INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, booked_on TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', counterparty TEXT NOT NULL DEFAULT '',
      category TEXT REFERENCES categories(code) ON UPDATE CASCADE, category_source TEXT, suggestion TEXT,
      note TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL UNIQUE, import_id INTEGER REFERENCES imports(id), created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(booked_on);
    CREATE INDEX IF NOT EXISTS idx_tx_category_date ON transactions(category, booked_on);
    CREATE INDEX IF NOT EXISTS idx_tx_counterparty ON transactions(counterparty);
    CREATE INDEX IF NOT EXISTS idx_tx_open ON transactions(booked_on) WHERE category IS NULL;
    CREATE TABLE IF NOT EXISTS access (email TEXT PRIMARY KEY, added_by TEXT NOT NULL, added_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rules (
      counterparty TEXT NOT NULL, category TEXT NOT NULL REFERENCES categories(code) ON UPDATE CASCADE,
      hits INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY (counterparty, category)
    );
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
