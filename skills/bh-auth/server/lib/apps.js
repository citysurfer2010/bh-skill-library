import { randomUUID } from "node:crypto";

const now = () => Math.floor(Date.now() / 1000);

/** Eigener Pfad oder https-Adresse, damit kein javascript:-Link in die Uebersicht kommt. */
export function validAppUrl(url) {
  const u = String(url || "").trim();
  if (u.length > 300 || /[\s<>"']/.test(u)) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try { return new URL(u).protocol === "https:" ? u : null; } catch { return null; }
}

export function appsStore(db) {
  return {
    list: ({ admin }) => db.prepare(`SELECT * FROM apps ${admin ? "" : "WHERE adminOnly = 0"} ORDER BY name`).all(),
    create({ name, description, url, adminOnly }) {
      db.prepare("INSERT INTO apps (id, name, description, url, adminOnly, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), name, description, url, adminOnly ? 1 : 0, now());
    },
    remove: (id) => db.prepare("DELETE FROM apps WHERE id = ?").run(id).changes,
  };
}
