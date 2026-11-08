import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

const now = () => Math.floor(Date.now() / 1000);
const hashToken = (t) => createHash("sha256").update(t).digest("hex");
const normal = (email) => String(email || "").trim().toLowerCase();
export const MIN_PASSWORD = 12;
export const HOURS = { invite: 72, reset: 1 };
// Gleiche Rechenzeit auch fuer unbekannte Adressen.
const DUMMY = bcrypt.hashSync("nicht-vorhanden", 12);

export function usersStore(db) {
  const get = (sql, ...a) => db.prepare(sql).get(...a) || null;
  const store = {
    byId: (id) => get("SELECT * FROM users WHERE id = ?", id),
    byEmail: (email) => get("SELECT * FROM users WHERE email = ?", normal(email)),
    list: () => db.prepare("SELECT * FROM users ORDER BY email").all(),
    countAdmins: () => get("SELECT COUNT(*) AS n FROM users WHERE isAdmin = 1 AND disabled = 0").n,

    create({ email, name, isAdmin = false }) {
      const id = randomUUID();
      db.prepare("INSERT INTO users (id, email, name, isAdmin, mustChangePassword, createdAt) VALUES (?, ?, ?, ?, 0, ?)")
        .run(id, normal(email), String(name || email).trim(), isAdmin ? 1 : 0, now());
      return store.byId(id);
    },

    async checkPassword(email, password) {
      const user = store.byEmail(email);
      const hash = user?.passwordHash || DUMMY;
      const match = await bcrypt.compare(String(password || ""), hash);
      return match && user?.passwordHash && !user.disabled ? user : null;
    },

    async setPassword(id, password) {
      const hash = await bcrypt.hash(password, 12);
      db.prepare(`UPDATE users SET passwordHash = ?, mustChangePassword = 0, resetTokenHash = NULL, resetTokenExpiry = NULL,
                  tokenInvalidatedAt = ? WHERE id = ?`).run(hash, now(), id);
    },

    /** Einmal-Link; gespeichert wird nur der Hash. */
    issueLink(id, kind) {
      const token = randomBytes(32).toString("base64url");
      db.prepare("UPDATE users SET resetTokenHash = ?, resetTokenExpiry = ? WHERE id = ?")
        .run(hashToken(token), now() + HOURS[kind] * 3600, id);
      return token;
    },

    byLink(token) {
      if (!token) return null;
      const u = get("SELECT * FROM users WHERE resetTokenHash = ?", hashToken(String(token)));
      return u && !u.disabled && u.resetTokenExpiry > now() ? u : null;
    },

    touchLogin: (id) => db.prepare("UPDATE users SET lastLogin = ? WHERE id = ?").run(now(), id),
    bindGoogle: (id, sub) => db.prepare("UPDATE users SET googleSub = ? WHERE id = ?").run(sub, id),
    setName: (id, name) => db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, id),
    setAdmin: (id, on) => db.prepare("UPDATE users SET isAdmin = ? WHERE id = ?").run(on ? 1 : 0, id),
    setDisabled: (id, on) => db.prepare("UPDATE users SET disabled = ?, tokenInvalidatedAt = ? WHERE id = ?").run(on ? 1 : 0, now(), id),
    invalidateSessions: (id) => db.prepare("UPDATE users SET tokenInvalidatedAt = ? WHERE id = ?").run(now(), id),
    remove: (id) => db.prepare("DELETE FROM users WHERE id = ?").run(id),
  };
  return store;
}
