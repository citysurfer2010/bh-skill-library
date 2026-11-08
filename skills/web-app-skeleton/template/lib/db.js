import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Neue Tabellen als neuen Eintrag anhaengen, bestehende Eintraege nie aendern.
const MIGRATIONS = [
  `CREATE TABLE items (
     id INTEGER PRIMARY KEY,
     title TEXT NOT NULL,
     created_by TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
];

export function openDb(file) {
  let target = file;
  if (!target) {
    const dir = process.env.DATA_DIR || "./data";
    mkdirSync(dir, { recursive: true });
    target = path.join(dir, "app.db");
  }
  const db = new DatabaseSync(target);
  db.exec("PRAGMA journal_mode = WAL");
  const { user_version: version } = db.prepare("PRAGMA user_version").get();
  MIGRATIONS.slice(version).forEach((sql, i) => {
    db.exec(sql);
    db.exec(`PRAGMA user_version = ${version + i + 1}`);
  });
  return db;
}
