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
    -- Flats (module Immobilien) and their loans (Finanzen → Kredite), taken over from the sheet "Portfolioübersicht – Bankübersicht Finanzierung" (scripts/import-loans.js).
    CREATE TABLE IF NOT EXISTS estate_units (
      unit_key TEXT PRIMARY KEY, address TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', floor TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', sqm REAL,
      market_value_cents INTEGER, land_charge_cents INTEGER, rent_year_cents INTEGER, note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, unit_key TEXT NOT NULL REFERENCES estate_units(unit_key) ON DELETE CASCADE, position INTEGER NOT NULL,
      lender TEXT NOT NULL DEFAULT '', account_iban TEXT NOT NULL DEFAULT '', amount_cents INTEGER, balance_cents INTEGER, annuity_cents INTEGER, ends_on TEXT,
      UNIQUE (unit_key, position)
    );
    CREATE INDEX IF NOT EXISTS idx_loans_unit ON loans(unit_key);
    -- Balances from the bank's loan statements (scripts/import-loan-statements.js) and the folder with a loan's papers; keyed by account number, so they survive a new sheet import.
    CREATE TABLE IF NOT EXISTS loan_balances (ref TEXT NOT NULL, balance_on TEXT NOT NULL, balance_cents INTEGER NOT NULL, rate_pct REAL, PRIMARY KEY (ref, balance_on));
    CREATE TABLE IF NOT EXISTS loan_docs (ref TEXT PRIMARY KEY, url TEXT NOT NULL);
    -- Account of a loan the sheet lists without one, found from its statement (same flat folder, same bank as a known loan).
    -- A loan that finances several flats together, named by its statement ("…str.20 WE30,31"); its balance is split by market value.
    CREATE TABLE IF NOT EXISTS loan_shares (ref TEXT NOT NULL, unit_key TEXT NOT NULL, PRIMARY KEY (ref, unit_key));
    CREATE TABLE IF NOT EXISTS loan_refs (unit_key TEXT NOT NULL, position INTEGER NOT NULL, ref TEXT NOT NULL, PRIMARY KEY (unit_key, position));
    -- A loan account the bank renumbered (PSD 10/2025): payments and statements of the new number count for the loan.
    CREATE TABLE IF NOT EXISTS loan_aliases (alias TEXT PRIMARY KEY, ref TEXT NOT NULL);
    -- Depot and other assets the banks do not report: a value per name and date, entered on the page "Vermögen".
    CREATE TABLE IF NOT EXISTS wealth_assets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, value_cents INTEGER NOT NULL, as_of TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (name, as_of));
    -- Positions of a depot export (lib/depot.js): the value of the depot on that day is their sum.
    CREATE TABLE IF NOT EXISTS wealth_positions (asset_name TEXT NOT NULL, as_of TEXT NOT NULL, name TEXT NOT NULL, wkn TEXT NOT NULL DEFAULT '', isin TEXT NOT NULL DEFAULT '', qty REAL NOT NULL, price_cents INTEGER NOT NULL, value_cents INTEGER NOT NULL, invested_cents INTEGER, asset_class TEXT NOT NULL DEFAULT '');
    -- Drive folder of each flat and its financing papers (scripts/import-estate-links.js); kept across sheet imports.
    CREATE TABLE IF NOT EXISTS estate_links (unit_key TEXT PRIMARY KEY, folder_url TEXT, finance_url TEXT);
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
  // Since 22.11.2026: a booking can be split over several categories (loan rate = interest + repayment), the booking itself stays one.
  conn.exec(`CREATE TABLE IF NOT EXISTS transaction_splits (transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE, category TEXT NOT NULL, cents INTEGER NOT NULL, PRIMARY KEY (transaction_id, category));
    CREATE INDEX IF NOT EXISTS idx_splits_category ON transaction_splits(category);`);
  if (conn.prepare("SELECT 1 FROM categories WHERE code = 'IMMORATE'").get()) conn.prepare("INSERT OR IGNORE INTO categories (code, art, name, description) VALUES ('TILG', 'Investment', 'Tilgung Immobilienkredite', 'Tilgungsanteil der Darlehensraten: baut Vermögen auf, die Restschuld sinkt')").run();
  // Since 16.11.2026: NLW ("Besitzer seit") of a flat and the sheet's interest rate of a loan (fallback when no statement names one).
  if (!conn.prepare('PRAGMA table_info(estate_units)').all().some((c) => c.name === 'owned_since')) conn.exec('ALTER TABLE estate_units ADD COLUMN owned_since TEXT');
  if (!conn.prepare('PRAGMA table_info(loans)').all().some((c) => c.name === 'rate_pct')) conn.exec('ALTER TABLE loans ADD COLUMN rate_pct REAL');
  // Optional link per asset (22.11.2026: portal of an employee participation), kept across value points.
  if (!conn.prepare('PRAGMA table_info(wealth_assets)').all().some((c) => c.name === 'url')) conn.exec('ALTER TABLE wealth_assets ADD COLUMN url TEXT');
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
