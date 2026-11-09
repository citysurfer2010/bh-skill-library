// Receives a user's iCloud login and checks it before saving.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { home } from "./connect-google.mjs";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5; // Repeated bad logins can get an Apple account locked.
const fails = new Map();
const EMAIL = /^[^\s@]{1,128}@[^\s@]{1,125}$/;
// Only app-specific passwords: the real Apple password must never end up here.
const APP_PASSWORD = /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/;
const ICLOUD_HOST = /(^|\.)icloud\.com$/i;

export async function icloudLogin(appleId, password, fetchImpl = fetch) {
  const headers = { authorization: `Basic ${Buffer.from(`${appleId}:${password}`).toString("base64")}`, depth: "0", "content-type": "application/xml; charset=utf-8", "user-agent": "bh-mcp-gateway" };
  const body = '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
  let url = new URL("https://caldav.icloud.com/");
  for (let i = 0; i < 4; i++) {
    const r = await fetchImpl(url, { method: "PROPFIND", headers, body, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (r.status === 207) return true;
    if (r.status === 401) return false;
    const next = r.status >= 300 && r.status < 400 && r.headers.get("location");
    if (!next) break;
    url = new URL(next, url);
    if (url.protocol !== "https:" || !ICLOUD_HOST.test(url.hostname)) break;
  }
  throw Object.assign(new Error("iCloud ist gerade nicht erreichbar"), { http: 502 });
}

const dirOf = (h) => path.join(h, ".config", "bh-icloud");
const envOf = (h) => path.join(dirOf(h), ".env");
const REJECT_MARKERS = [".rejected-dav", ".rejected-mail"];
const rejected = (h, marker) => existsSync(path.join(dirOf(h), marker));

function storedPassword(h) {
  try { return /^BH_ICLOUD_PASSWORD=(.*)$/m.exec(readFileSync(envOf(h), "utf8"))?.[1] || ""; } catch { return ""; }
}

export async function storeIcloudLogin(usersDir, { user, appleId, password, mailUser } = {}, login = icloudLogin, now = Date.now) {
  const h = home(usersDir, user);
  if (!h) return { status: 404, error: "User unbekannt" };
  // Apple shows an app-specific password only once: changing the mail address must not require a new one.
  const secret = password || storedPassword(h);
  if (typeof appleId !== "string" || !EMAIL.test(appleId)) return { status: 400, error: "Apple-ID fehlt oder ist keine E-Mail-Adresse" };
  if (typeof secret !== "string" || !APP_PASSWORD.test(secret)) return { status: 400, error: "Bitte ein app-spezifisches Passwort angeben (Form xxxx-xxxx-xxxx-xxxx), nicht das Apple-Passwort" };
  const mail = mailUser || appleId;
  if (typeof mail !== "string" || !EMAIL.test(mail)) return { status: 400, error: "iCloud-Mail-Adresse ist ungültig" };
  const entry = fails.get(user);
  if (entry && now() - entry.at < WINDOW_MS && entry.n >= MAX_FAILS) return { status: 429, error: "Zu viele Versuche, bitte später erneut" };
  if (!(await login(appleId, secret))) {
    const fresh = entry && now() - entry.at < WINDOW_MS ? entry : { n: 0, at: now() };
    fails.set(user, { n: fresh.n + 1, at: fresh.at });
    return { status: 400, error: "iCloud hat die Anmeldung abgelehnt. Prüfe die Apple-ID und gib ein neu erstelltes app-spezifisches Passwort ein. Dein normales Apple-Passwort funktioniert hier nicht." };
  }
  fails.delete(user);
  mkdirSync(dirOf(h), { recursive: true, mode: 0o700 });
  const file = envOf(h);
  writeFileSync(`${file}.new`, `BH_ICLOUD_APPLE_ID=${appleId}\nBH_ICLOUD_PASSWORD=${secret}\nBH_ICLOUD_MAIL_USER=${mail}\n`, { mode: 0o600 });
  renameSync(`${file}.new`, file);
  for (const m of REJECT_MARKERS) rmSync(path.join(dirOf(h), m), { force: true });
  return { status: 200, connected: true, appleId };
}

export function icloudStatus(usersDir, { user }) {
  const h = home(usersDir, user);
  if (!h) return { status: 404, error: "User unbekannt" };
  try {
    const appleId = /^BH_ICLOUD_APPLE_ID=(.*)$/m.exec(readFileSync(envOf(h), "utf8"))?.[1] || null;
    return { status: 200, connected: true, appleId, rejected: rejected(h, ".rejected-dav"), mailRejected: rejected(h, ".rejected-mail") };
  } catch { return { status: 200, connected: false, appleId: null, rejected: false, mailRejected: false }; }
}

export function removeIcloud(usersDir, { user }) {
  const h = home(usersDir, user);
  if (!h) return { status: 404, error: "User unbekannt" };
  rmSync(dirOf(h), { recursive: true, force: true });
  return { status: 200, connected: false };
}
