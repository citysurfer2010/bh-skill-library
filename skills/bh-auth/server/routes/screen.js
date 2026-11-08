import { timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import express, { Router } from "express";
import { esc } from "../lib/views.js";
import { screenJpeg } from "../lib/screen-image.js";

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return b !== "" && x.length === y.length && timingSafeEqual(x, y); };

// Anzeige fuer den Beamer: Er kann sich nicht anmelden, der Link selbst ist das Geheimnis.
export function screenRoutes({ config }) {
  const r = Router();
  const file = path.join(config.dataDir, "screen.json");
  const load = () => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return { title: "", text: "" }; } };
  const clip = (v, n) => String(v ?? "").slice(0, n);

  r.get("/screen/:token", (req, res, next) => {
    if (!same(req.params.token, config.screenRead)) return next();
    const c = load();
    res.type("html").send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BH Platform</title><link rel="stylesheet" href="/screen.css"></head><body><main><h1 id="t">${esc(c.title)}</h1><p id="s">${esc(c.text)}</p></main><script src="/screen.js"></script></body></html>`);
  });
  r.get("/screen/:token/content", (req, res, next) => (same(req.params.token, config.screenRead) ? res.json(load()) : next()));
  r.get("/screen/:token/image.jpg", async (req, res, next) => {
    if (!same(req.params.token, config.screenRead)) return next();
    res.set("Cache-Control", "no-store").type("image/jpeg").send(await screenJpeg(load()));
  });
  r.post("/screen-update", express.json({ limit: "32kb" }), (req, res) => {
    const auth = /^Bearer (.+)$/.exec(req.get("authorization") || "");
    if (!auth || !same(auth[1], config.screenWrite)) return res.status(401).json({ error: "unauthorized" });
    writeFileSync(file, JSON.stringify({ title: clip(req.body?.title, 200), text: clip(req.body?.text, 1000) }), { mode: 0o600 });
    res.status(204).end();
  });
  return r;
}
