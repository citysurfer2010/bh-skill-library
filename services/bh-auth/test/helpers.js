import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server.js";
import { loadConfig } from "../lib/config.js";
import { openDb } from "../lib/db.js";
import { usersStore } from "../lib/users.js";
import { rateLimiter } from "../lib/rate-limit.js";

export const PW = "ein-langes-passwort";

export async function start({ google = false, fetchImpl, limiter } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "auth-"));
  const config = loadConfig({ DATA_DIR: dir, SCREEN_READ: "lesen", SCREEN_WRITE: "schreiben", ...(google ? { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec" } : {}) });
  if (fetchImpl) config.fetch = fetchImpl;
  const db = openDb(":memory:");
  const users = usersStore(db);
  const server = createApp({ config, db, limiter: limiter || rateLimiter({ max: 3 }) }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;
  const client = () => {
    const jar = new Map();
    return async (url, { form, headers, method } = {}) => {
      const res = await fetch(base + url, {
        redirect: "manual", method: method || (form ? "POST" : "GET"),
        headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...headers },
        body: form ? new URLSearchParams(form) : undefined,
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";"); const i = pair.indexOf("=");
        const v = pair.slice(i + 1);
        if (v) jar.set(pair.slice(0, i), v); else jar.delete(pair.slice(0, i));
      }
      return res;
    };
  };
  const addUser = async (email, opts = {}) => { const u = users.create({ email, name: opts.name || email, isAdmin: opts.admin }); if (opts.password !== false) await users.setPassword(u.id, PW); return users.byId(u.id); };
  const login = async (c, email) => c("/login", { form: { email, password: PW } });
  return { base, users, client, addUser, login, config, stop: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
