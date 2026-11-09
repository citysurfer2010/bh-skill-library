// Receives the Google grant that the login service obtained in the browser. It never passes through a model.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { timingSafeEqual, createHash } from "node:crypto";
import path from "node:path";

const hash = (s) => createHash("sha256").update(String(s)).digest();
export const secretOk = (expected, given) => !!expected && !!given && timingSafeEqual(hash(expected), hash(given));

export const home = (usersDir, user) => (/^[a-z0-9][a-z0-9_-]{0,62}$/.test(String(user)) && existsSync(path.join(usersDir, user)) ? path.join(usersDir, user) : null);
const dirOf = (h) => path.join(h, ".config", "bh-google-workspace");
const credsOf = (h) => path.join(dirOf(h), "credentials.json");
const accountOf = (h) => path.join(dirOf(h), "account.json");
const email = (h) => { try { return JSON.parse(readFileSync(accountOf(h), "utf8")).email || null; } catch { return null; } };

export function googleStatus(usersDir, { user }) {
  const h = home(usersDir, user);
  if (!h) return { status: 404, error: "User unbekannt" };
  const connected = existsSync(credsOf(h));
  return { status: 200, connected, email: connected ? email(h) : null };
}

export function storeGoogle(usersDir, b) {
  const h = home(usersDir, b.user);
  if (!h) return { status: 404, error: "User unbekannt" };
  if (!b.refresh_token || !b.access_token || !b.client_id || !b.client_secret) return { status: 400, error: "Angaben fehlen" };
  const file = credsOf(h);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.new`, JSON.stringify({ auth_provider: "self", client_id: b.client_id, client_secret: b.client_secret, access_token: b.access_token, refresh_token: b.refresh_token, expiry_date: Date.now() + Number(b.expires_in || 3600) * 1000 }, null, 2), { mode: 0o600 });
  renameSync(`${file}.new`, file);
  writeFileSync(accountOf(h), JSON.stringify({ email: b.email || null }), { mode: 0o600 });
  return { status: 200, connected: true };
}

/** Revokes the grant at Google where possible, and deletes it here in any case. */
export async function removeGoogle(usersDir, { user }, fetchImpl = fetch) {
  const h = home(usersDir, user);
  if (!h) return { status: 404, error: "User unbekannt" };
  try {
    const { refresh_token: token } = JSON.parse(readFileSync(credsOf(h), "utf8"));
    if (token) await fetchImpl("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(8000) });
  } catch (e) { console.error(`[google] Entzug: ${e.message}`); }
  for (const f of [credsOf(h), `${credsOf(h)}.lkg`, `${credsOf(h)}.new`, accountOf(h)]) rmSync(f, { force: true });
  return { status: 200, connected: false };
}
