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
    -- Bankabruf (Enable Banking): offene Anmeldungen, Zustimmungen der Bank und die Konten darin.
    CREATE TABLE IF NOT EXISTS bank_states (state TEXT PRIMARY KEY, aspsp TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bank_sessions (
      session_id TEXT PRIMARY KEY, aspsp TEXT NOT NULL, valid_until TEXT, status TEXT NOT NULL DEFAULT 'active', created_by TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bank_accounts (
      uid TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES bank_sessions(session_id) ON DELETE CASCADE, aspsp TEXT NOT NULL,
      iban TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', label TEXT NOT NULL, first_booked_on TEXT,
      last_sync_at TEXT, last_error TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_session ON bank_accounts(session_id);
    -- Bereich je Konto: nur "haushalt" zählt in Übersicht, Investments und „Zu prüfen“. Fehlt eine Zeile, gilt haushalt.
    CREATE TABLE IF NOT EXISTS accounts (
      name TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT 'haushalt' CHECK (scope IN ('haushalt', 'immobilien', 'treuhand')), updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_scope ON accounts(scope);
    CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account, booked_on);
  `);
  conn.exec(`
    -- Amazon: jede Belastung von der Zahlungsseite und die Artikel je Bestellung (skills/bh-amazon).
    CREATE TABLE IF NOT EXISTS amazon_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, paid_on TEXT NOT NULL, amount_cents INTEGER NOT NULL, method TEXT NOT NULL DEFAULT '',
      fetched_at TEXT NOT NULL, UNIQUE (order_id, paid_on, amount_cents, method)
    );
    CREATE INDEX IF NOT EXISTS idx_amazon_pay_order ON amazon_payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_amazon_pay_amount ON amazon_payments(amount_cents, paid_on);
    CREATE TABLE IF NOT EXISTS amazon_items (order_id TEXT NOT NULL, asin TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, PRIMARY KEY (order_id, asin));
    CREATE TABLE IF NOT EXISTS amazon_orders_seen (order_id TEXT PRIMARY KEY, fetched_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS amazon_orders (order_id TEXT PRIMARY KEY, ordered_on TEXT, total_cents INTEGER, fetched_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_amazon_orders_date ON amazon_orders(ordered_on);
    CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const txCols = conn.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
  if (!txCols.includes('amazon_order')) conn.exec('ALTER TABLE transactions ADD COLUMN amazon_order TEXT');
  conn.exec('CREATE INDEX IF NOT EXISTS idx_tx_amazon_order ON transactions(amazon_order) WHERE amazon_order IS NOT NULL');
  if (!txCols.includes('counterparty_iban')) conn.exec('ALTER TABLE transactions ADD COLUMN counterparty_iban TEXT');
  conn.exec('CREATE INDEX IF NOT EXISTS idx_tx_amount_date ON transactions(amount_cents, booked_on)');
  const bankCols = conn.prepare('PRAGMA table_info(bank_accounts)').all().map((c) => c.name);
  for (const col of ['product', 'details', 'usage', 'balance_type', 'balance_on']) if (!bankCols.includes(col)) conn.exec(`ALTER TABLE bank_accounts ADD COLUMN ${col} TEXT`);
  if (!bankCols.includes('balance_cents')) conn.exec('ALTER TABLE bank_accounts ADD COLUMN balance_cents INTEGER');
  // Link to the bank's own booking id, so the daily overlap never books anything twice.
  if (!conn.prepare('PRAGMA table_info(transactions)').all().some((c) => c.name === 'bank_ref')) conn.exec('ALTER TABLE transactions ADD COLUMN bank_ref TEXT');
  conn.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_bank_ref ON transactions(account, bank_ref) WHERE bank_ref IS NOT NULL; CREATE INDEX IF NOT EXISTS idx_tx_account_amount ON transactions(account, amount_cents, booked_on);');
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
