import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     passwordHash TEXT,
     isAdmin INTEGER NOT NULL DEFAULT 0,
     mustChangePassword INTEGER NOT NULL DEFAULT 0,
     googleSub TEXT UNIQUE,
     resetTokenHash TEXT,
     resetTokenExpiry INTEGER,
     disabled INTEGER NOT NULL DEFAULT 0,
     tokenInvalidatedAt INTEGER NOT NULL DEFAULT 0,
     lastLogin INTEGER,
     createdAt INTEGER NOT NULL
   )`,
  `CREATE TABLE apps (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     url TEXT NOT NULL,
     adminOnly INTEGER NOT NULL DEFAULT 0,
     createdAt INTEGER NOT NULL
   )`,
  "ALTER TABLE users ADD COLUMN googleEmail TEXT",
  "ALTER TABLE users ADD COLUMN avatarType TEXT",
  "ALTER TABLE users ADD COLUMN avatarAt INTEGER",
];

export function openDb(fileOrDir) {
  const file = fileOrDir === ":memory:" ? fileOrDir : path.join(fileOrDir, "auth.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON");
  const { user_version: v } = db.prepare("PRAGMA user_version").get();
  MIGRATIONS.slice(v).forEach((sql, i) => { db.exec(sql); db.exec(`PRAGMA user_version = ${v + i + 1}`); });
  return db;
}
