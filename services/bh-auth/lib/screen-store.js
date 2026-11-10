// Beamer state in SQLite. Older JSON files are taken over once and kept as *.imported.
import { readFileSync, renameSync } from "node:fs";
import path from "node:path";

const EMPTY = { mode: "text", title: "", text: "", url: null };
const FIELDS = ["mode", "title", "text", "url", "offer", "session", "answer", "video", "station"];

function readLegacy(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
function retire(file) { try { renameSync(file, `${file}.imported`); } catch { /* nothing to retire */ } }

export function screenStore(db, dataDir) {
  const insertContent = db.prepare(`INSERT OR REPLACE INTO screen_content (id, ${FIELDS.join(", ")}) VALUES (1, ${FIELDS.map(() => "?").join(", ")})`);
  const saveContent = (c) => insertContent.run(...FIELDS.map((f) => c[f] ?? (f === "title" || f === "text" ? "" : null)));
  const selectContent = db.prepare("SELECT * FROM screen_content WHERE id = 1");
  const insertMenu = db.prepare("INSERT OR REPLACE INTO screen_menu (id, data) VALUES (1, ?)");
  const selectMenu = db.prepare("SELECT data FROM screen_menu WHERE id = 1");

  const contentFile = path.join(dataDir, "screen.json");
  const menuFile = path.join(dataDir, "screen-menu.json");
  const content = readLegacy(contentFile);
  if (content && !selectContent.get()) saveContent({ ...EMPTY, ...content });
  if (content) retire(contentFile);
  const menu = readLegacy(menuFile);
  if (menu && !selectMenu.get()) insertMenu.run(JSON.stringify(menu));
  if (menu) retire(menuFile);

  return {
    load() { const row = selectContent.get(); if (!row) return { ...EMPTY }; const { id: _id, ...rest } = row; return { ...rest }; },
    saveContent,
    setAnswer: (answer) => db.prepare("UPDATE screen_content SET answer = ? WHERE id = 1").run(answer),
    loadMenu() { const row = selectMenu.get(); return row ? JSON.parse(row.data) : null; },
    saveMenu: (data) => insertMenu.run(JSON.stringify(data)),
  };
}
