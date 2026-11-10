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

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY, user_email TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Neues Gespräch',
      mode TEXT NOT NULL DEFAULT 'do', summary TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_email, updated_at DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', tool_calls TEXT, tool_call_id TEXT, tool_name TEXT,
      compacted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, compacted, id);
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      tool TEXT NOT NULL, args TEXT NOT NULL, tool_call_id TEXT NOT NULL, status TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_chat_status ON cards(chat_id, status);
    CREATE TABLE IF NOT EXISTS steps (
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, position INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, position)
    );
    CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_email, id);
    CREATE TABLE IF NOT EXISTS trusted_tools (user_email TEXT NOT NULL, tool TEXT NOT NULL, PRIMARY KEY (user_email, tool));
    CREATE TABLE IF NOT EXISTS profiles (user_email TEXT PRIMARY KEY, setup_chat_id TEXT, created_at TEXT NOT NULL);
  `);
  // Columns added after the first release; ALTER TABLE has no IF NOT EXISTS.
  const has = (table, column) => conn.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has('chats', 'kind')) conn.exec("ALTER TABLE chats ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'");
  if (!has('messages', 'hidden')) conn.exec('ALTER TABLE messages ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
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
