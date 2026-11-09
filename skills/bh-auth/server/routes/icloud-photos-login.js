import http from "node:http";
import { Router } from "express";

const PREFIX = "/profile/icloud-photos";
const UPSTREAM_TIMEOUT_MS = 60_000;
const FORWARDED = ["accept", "hx-request", "hx-current-url", "hx-target", "hx-trigger"];
const THIRD_PARTY_CSS = /<link[^>]+cdn\.jsdelivr\.net[^>]*>/g;
const PAGE_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

/** The login page of the download container uses absolute paths; here they must carry the prefix. */
export const rewriteHtml = (html) => html.replace(THIRD_PARTY_CSS, "").replace(/(=\s*["'])\/(?!\/)/g, `$1${PREFIX}/`);

export const isPhotosOwner = (user) => !!process.env.BH_ICLOUD_PHOTOS_OWNER && String(user?.email || "").toLowerCase() === process.env.BH_ICLOUD_PHOTOS_OWNER.toLowerCase();

// The Apple password only passes through to the download container and is stored nowhere here.
export function icloudPhotosRoutes({ requireLogin }) {
  const r = Router();
  r.use("/profile/icloud-photos", requireLogin, (req, res) => {
    if (!isPhotosOwner(req.user)) return res.status(403).send("Keine Berechtigung");
    const body = req.body && Object.keys(req.body).length ? new URLSearchParams(req.body).toString() : "";
    const headers = {};
    for (const h of FORWARDED) if (req.headers[h]) headers[h] = req.headers[h];
    if (body) { headers["content-type"] = "application/x-www-form-urlencoded"; headers["content-length"] = Buffer.byteLength(body); }
    const up = http.request({ host: process.env.BH_ICLOUD_LOGIN_HOST || "bh-icloud-photos", port: Number(process.env.BH_ICLOUD_LOGIN_PORT) || 8080, method: req.method, path: req.url, headers, timeout: UPSTREAM_TIMEOUT_MS }, (u) => {
      const type = u.headers["content-type"] || "application/octet-stream";
      res.status(u.statusCode).set({ "content-type": type, "Content-Security-Policy": PAGE_CSP });
      for (const [k, v] of Object.entries(u.headers)) if (k.startsWith("hx-")) res.set(k, v);
      if (!type.includes("text/html")) { u.pipe(res); return; }
      const parts = [];
      u.on("data", (c) => parts.push(c));
      u.on("end", () => res.send(rewriteHtml(Buffer.concat(parts).toString("utf8"))));
    });
    up.on("timeout", () => up.destroy(new Error("timeout")));
    up.on("error", () => { if (!res.headersSent) res.status(502).send("Der Foto-Abgleich läuft gerade nicht."); });
    up.end(body);
  });
  return r;
}
