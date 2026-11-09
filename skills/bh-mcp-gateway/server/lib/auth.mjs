// Token per user, same file as the LLM gateway: { "<token>": "devbox/<name>" }; platform apps as "app/<name>".
import { readFileSync, statSync } from "node:fs";

let cached = { mtimeMs: -1, map: new Map() };

function tokens(file) {
  try {
    const { mtimeMs } = statSync(file);
    if (mtimeMs !== cached.mtimeMs) cached = { mtimeMs, map: new Map(Object.entries(JSON.parse(readFileSync(file, "utf8")))) };
    return cached.map;
  } catch (e) {
    console.error(`[auth] ${file}: ${e.message}`);
    return new Map();
  }
}

/** Name of the user for the bearer token, otherwise null. */
export function userFromRequest(req, file) {
  const m = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const caller = tokens(file).get(m[1]);
  const name = /^(?:devbox|app)\/([a-z][a-z0-9-]{1,30})$/.exec(caller || "");
  return name ? name[1] : null;
}
