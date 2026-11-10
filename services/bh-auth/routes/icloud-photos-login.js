import http from "node:http";
import { Router } from "express";
import { icloudPhotosView } from "../lib/views-icloud-photos.js";

const BASE = "/profile/icloud-photos";
const UPSTREAM_TIMEOUT_MS = 30_000;

export const isPhotosOwner = (user) => !!process.env.BH_ICLOUD_PHOTOS_OWNER && String(user?.email || "").toLowerCase() === process.env.BH_ICLOUD_PHOTOS_OWNER.toLowerCase();

function upstream(method, path, form) {
  const body = form ? new URLSearchParams(form).toString() : "";
  const headers = body ? { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body) } : {};
  return new Promise((resolve, reject) => {
    const req = http.request({ host: process.env.BH_ICLOUD_LOGIN_HOST || "bh-icloud-photos", port: Number(process.env.BH_ICLOUD_LOGIN_PORT) || 8080, method, path, headers, timeout: UPSTREAM_TIMEOUT_MS }, (res) => {
      const parts = []; res.on("data", (c) => parts.push(c)); res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

/** The download container's status page tells which input it waits for; we only read that, never the file list. */
export function parseState(html) {
  const fieldOf = (action) => {
    const at = html.indexOf(`hx-post="${action}"`); if (at < 0) return null;
    const form = html.slice(at, html.indexOf("</form>", at) >>> 0 || at + 2000);
    return /<input[^>]*name="([^"]+)"/.exec(form)?.[1] || null;
  };
  const password = fieldOf("/password"); if (password) return { step: "password", field: password };
  const code = fieldOf("/code"); if (code) return { step: "code", field: code };
  if (/No input is needed/i.test(html)) return { step: "ok" };
  return { step: "busy" };
}

async function currentState() {
  try { const r = await upstream("GET", "/status"); return r.status === 200 ? parseState(r.text) : { step: "down" }; } catch { return { step: "down" }; }
}

// The Apple password only passes through to the download container and is stored nowhere here.
export function icloudPhotosRoutes({ requireLogin }) {
  const r = Router();
  const owner = (req, res, next) => (isPhotosOwner(req.user) ? next() : res.status(403).send("Keine Berechtigung"));
  // after: the step just sent. Coming back to the same step means Apple did not accept it.
  const AGAIN = { password: "Apple hat die Anmeldung nicht bestätigt. Bitte prüfe das Passwort und versuche es erneut.", code: "Apple hat den Code nicht angenommen. Bitte prüfe ihn oder warte auf einen neuen." };
  const show = async (req, res, extra = {}) => {
    const after = ["password", "code"].includes(req.query.after) ? req.query.after : "";
    const state = { ...(await currentState()), account: process.env.BH_ICLOUD_PHOTOS_ACCOUNT || "", after };
    const error = extra.error || (after && state.step === after ? AGAIN[after] : "");
    res.type("html").send(icloudPhotosView({ user: req.user, state, error }));
  };
  r.get(`${BASE}/state`, requireLogin, owner, async (_req, res) => res.set("Cache-Control", "no-store").json({ step: (await currentState()).step }));
  r.get(`${BASE}/`, requireLogin, owner, (req, res) => show(req, res));
  for (const step of ["password", "code"]) {
    r.post(`${BASE}/${step}`, requireLogin, owner, async (req, res) => {
      const raw = String(req.body?.[step] ?? "");
      const value = step === "code" ? raw.replace(/\s/g, "") : raw.trim(); // Apple shows the code as "123 456"
      const state = await currentState();
      if (state.step !== step) return show(req, res, { error: "Deine Eingabe ist schon angekommen. Hier ist der aktuelle Stand." });
      if (!value) return show(req, res, { error: step === "code" ? "Bitte den Code eingeben." : "Bitte das Passwort eingeben." });
      try {
        const sent = await upstream("POST", `/${step}`, { [state.field]: value });
        if (sent.status >= 400) return show(req, res, { error: step === "code" ? "Apple hat den Code nicht angenommen. Bitte prüfe ihn oder warte auf einen neuen." : "Apple hat das Passwort nicht angenommen. Bitte prüfe es." });
      } catch { return show(req, res, { error: "Der Foto-Abgleich ist gerade nicht erreichbar." }); }
      res.redirect(303, `${BASE}/?after=${step}`);
    });
  }
  return r;
}
