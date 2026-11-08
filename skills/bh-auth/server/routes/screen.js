import { randomBytes, timingSafeEqual } from "node:crypto";
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
  const load = () => { try { return { mode: "text", url: null, ...JSON.parse(readFileSync(file, "utf8")) }; } catch { return { mode: "text", title: "", text: "", url: null }; } };
  const clip = (v, n) => String(v ?? "").slice(0, n);
  const sdp = (v) => (typeof v === "string" && v.startsWith("v=0") && v.length <= 24000 ? v : null);
  const httpsUrl = (u) => { try { const p = new URL(String(u)); return p.protocol === "https:" && !/[\s"'<>\\]/.test(p.href) ? p.href : null; } catch { return null; } };

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
  // Der Beamer antwortet als Klartext: Ein JSON-POST aus der TV-App wuerde an der Vorabfrage scheitern.
  r.post("/screen/:token/answer", express.text({ type: "*/*", limit: "32kb" }), (req, res, next) => {
    if (!same(req.params.token, config.screenRead)) return next();
    let body; try { body = JSON.parse(req.body); } catch { return res.status(400).json({ error: "unlesbar" }); }
    const answer = sdp(body?.sdp); const c = load();
    if (!answer || c.mode !== "share" || body?.session !== c.session) return res.status(409).json({ error: "Sitzung passt nicht" });
    writeFileSync(file, JSON.stringify({ ...c, answer }), { mode: 0o600 });
    res.status(204).end();
  });
  r.get("/screen-answer", (req, res) => {
    const auth = /^Bearer (.+)$/.exec(req.get("authorization") || "");
    if (!auth || !same(auth[1], config.screenWrite)) return res.status(401).json({ error: "unauthorized" });
    const c = load();
    res.json({ answer: c.session && c.session === req.query.session ? c.answer : null });
  });
  r.post("/screen-update", express.json({ limit: "32kb" }), (req, res) => {
    const auth = /^Bearer (.+)$/.exec(req.get("authorization") || "");
    if (!auth || !same(auth[1], config.screenWrite)) return res.status(401).json({ error: "unauthorized" });
    // text: Anzeige in der App; url: Webseite im Vollbild; audio: Radio/Musik-Stream, den die App selbst abspielt.
    // share: Der Laptop bietet seinen Bildschirm an, die App antwortet unter /answer (WebRTC ohne Trickle-ICE).
    const mode = ["url", "audio", "share"].includes(req.body?.mode) ? req.body.mode : "text";
    const url = mode === "url" || mode === "audio" ? httpsUrl(req.body?.url) : null;
    if ((mode === "url" || mode === "audio") && !url) return res.status(400).json({ error: "Nur https-Adressen" });
    const offer = mode === "share" ? sdp(req.body?.offer) : null;
    if (mode === "share" && !offer) return res.status(400).json({ error: "Angebot ungueltig" });
    const previous = load().mode;
    const session = mode === "share" ? randomBytes(9).toString("hex") : null;
    writeFileSync(file, JSON.stringify({ mode, title: clip(req.body?.title, 200), text: clip(req.body?.text, 1000), url, offer, session, answer: null }), { mode: 0o600 });
    res.json({ ok: true, previous, session });
  });
  return r;
}
