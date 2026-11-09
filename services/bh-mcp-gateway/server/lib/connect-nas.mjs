// Receives a user's Synology login and checks it before saving.
import https from "node:https";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const fails = new Map();

export function nasLogin(user, password) {
  const url = new URL("/webapi/entry.cgi", process.env.BH_NAS_URL);
  const body = new URLSearchParams({ api: "SYNO.API.Auth", version: "6", method: "login", account: user, passwd: password, session: "FileStation", format: "sid" }).toString();
  const fingerprint = process.env.BH_NAS_FP;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "POST", timeout: 20_000, ca: Buffer.from(process.env.BH_NAS_CA_B64 || "", "base64").toString("utf8"),
      allowPartialTrustChain: true,
      checkServerIdentity: (_h, cert) => (cert.fingerprint256 === fingerprint ? undefined : new Error("Zertifikat der Synology stimmt nicht")),
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => { try { resolve(JSON.parse(text).success === true); } catch (e) { reject(e); } });
    });
    req.on("timeout", () => req.destroy(new Error("Synology antwortet nicht")));
    req.on("error", reject);
    req.end(body);
  });
}

export async function storeNasLogin(owner, home, { user, password } = {}, login = nasLogin, now = Date.now) {
  const valid = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\r\n\0]/.test(v);
  if (!valid(user, 128) || !valid(password, 256)) return { status: 400, error: "Benutzer oder Passwort fehlt" };
  const entry = fails.get(owner);
  if (entry && now() - entry.at < WINDOW_MS && entry.n >= MAX_FAILS) return { status: 429, error: "Zu viele Versuche, bitte später erneut" };
  if (!(await login(user, password))) {
    const fresh = entry && now() - entry.at < WINDOW_MS ? entry : { n: 0, at: now() };
    fails.set(owner, { n: fresh.n + 1, at: fresh.at });
    return { status: 400, error: "Benutzer oder Passwort falsch" };
  }
  fails.delete(owner);
  const dir = path.join(home, ".config", "bh-nas");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, ".env");
  writeFileSync(`${file}.new`, `BH_NAS_USER=${user}\nBH_NAS_PASSWORD=${password}\n`, { mode: 0o600 });
  renameSync(`${file}.new`, file);
  return { status: 200, user };
}
