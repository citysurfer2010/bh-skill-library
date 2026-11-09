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
  const menuFile = path.join(config.dataDir, "screen-menu.json");
  const loadMenu = () => { try { return JSON.parse(readFileSync(menuFile, "utf8")); } catch { return null; } };
  const requests = [];
  const requestWaiters = new Set();
  const waiters = new Set();
  let version = String(Date.now());
  const changed = () => { version = String(Number(version) + 1); [...waiters].forEach((w) => w()); };
  const clip = (v, n) => String(v ?? "").slice(0, n);
  const sdp = (v) => (typeof v === "string" && v.startsWith("v=0") && v.length <= 24000 ? v : null);
  const httpsUrl = (u) => { try { const p = new URL(String(u)); return p.protocol === "https:" && !/[\s"'<>\\]/.test(p.href) ? p.href : null; } catch { return null; } };

  r.get("/screen/:token", (req, res, next) => {
    if (!same(req.params.token, config.screenRead)) return next();
    const c = load();
    res.type("html").send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BH Platform</title><link rel="stylesheet" href="/screen.css"></head><body><main><h1 id="t">${esc(c.title)}</h1><p id="s">${esc(c.text)}</p></main><script src="/screen.js"></script></body></html>`);
  });
  // Der Beamer fragt mit ?since=<Stand>: Die Antwort kommt sofort bei einer Aenderung, spaetestens nach 25 s.
  r.get("/screen/:token/content", (req, res, next) => {
    if (!same(req.params.token, config.screenRead)) return next();
    if (req.query.since === undefined) return res.json(load());
    const send = () => res.json({ ...load(), menu: loadMenu(), v: version });
    if (req.query.since !== version) return send();
    let finished = false;
    const finish = (reply) => { if (finished) return; finished = true; clearTimeout(timer); waiters.delete(done); if (reply) send(); };
    const done = () => finish(true);
    const timer = setTimeout(done, 25_000);
    waiters.add(done);
    res.on("close", () => finish(false));
  });
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
  // Eigene Seite fuer den YouTube-Player: Aus der App heraus hat er keine Herkunft und verweigert das Abspielen.
  r.get("/screen/:token/player", (req, res, next) => {
    const v = String(req.query.v || "");
    if (!same(req.params.token, config.screenRead) || !/^[A-Za-z0-9_-]{11}$/.test(v)) return next();
    res.removeHeader("X-Frame-Options");
    res.set({ "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": "default-src 'none'; frame-src https://www.youtube-nocookie.com; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
    const params = `autoplay=1&controls=0&rel=0&loop=1&playlist=${v}&enablejsapi=1&iv_load_policy=3&origin=${encodeURIComponent(config.publicUrl)}`;
    res.type("html").send(`<!doctype html><meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#000;overflow:hidden}</style><iframe id="y" allow="autoplay; encrypted-media" src="https://www.youtube-nocookie.com/embed/${v}?${params}"></iframe><script>var y=document.getElementById("y");y.onload=function(){y.contentWindow.postMessage('{"event":"listening","id":1,"channel":"widget"}',"*")};addEventListener("message",function(e){if(e.source===parent)y.contentWindow.postMessage(e.data,"*");else parent.postMessage(e.data,"*")});</script>`);
  });
  // Auswahl mit der Fernbedienung; die App Beamer holt sie ab und fuehrt sie aus.
  r.post("/screen/:token/request", express.text({ type: "*/*", limit: "2kb" }), (req, res, next) => {
    if (!same(req.params.token, config.screenRead)) return next();
    let body; try { body = JSON.parse(req.body); } catch { return res.status(400).json({ error: "unlesbar" }); }
    if (!["radio", "mood", "back", "radiooff", "stop", "refresh"].includes(body?.kind) || !/^[a-z0-9]{1,40}$/.test(String(body?.id))) return res.status(400).json({ error: "ungueltig" });
    if (requests.length < 10) requests.push({ kind: body.kind, id: body.id });
    [...requestWaiters].forEach((w) => w());
    res.status(204).end();
  });
  const writer = (req) => { const a = /^Bearer (.+)$/.exec(req.get("authorization") || ""); return a && same(a[1], config.screenWrite); };
  // Lange Abfrage: Die App wartet auf eine Auswahl, statt staendig nachzufragen.
  r.get("/screen-requests", (req, res) => {
    if (!writer(req)) return res.status(401).json({ error: "unauthorized" });
    const wait = Math.min(Number(req.query.wait) || 0, 25);
    const reply = () => res.json({ requests: requests.splice(0) });
    if (requests.length || !wait) return reply();
    let finished = false;
    const finish = (send) => { if (finished) return; finished = true; clearTimeout(timer); requestWaiters.delete(done); if (send) reply(); };
    const done = () => finish(true);
    const timer = setTimeout(done, wait * 1000);
    requestWaiters.add(done);
    res.on("close", () => finish(false));
  });
  r.post("/screen-menu", express.json({ limit: "128kb" }), (req, res) => {
    if (!writer(req)) return res.status(401).json({ error: "unauthorized" });
    if (!Array.isArray(req.body?.radio) || !Array.isArray(req.body?.mood)) return res.status(400).json({ error: "ungueltig" });
    writeFileSync(menuFile, JSON.stringify({ radio: req.body.radio, mood: req.body.mood, schedule: req.body.schedule || null, board: req.body.board || null, alerts: req.body.alerts || [], birthdays: req.body.birthdays || [], rooms: req.body.rooms || [], events: req.body.events || [], onThisDay: req.body.onThisDay || null }), { mode: 0o600 });
    changed();
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
    const mode = ["url", "audio", "share", "video"].includes(req.body?.mode) ? req.body.mode : "text";
    // video: Stimmung im eingebetteten Player, url ist dann das optionale Radio dazu.
    const video = mode === "video" && /^[A-Za-z0-9_-]{11}$/.test(String(req.body?.video)) ? req.body.video : null;
    if (mode === "video" && !video) return res.status(400).json({ error: "Video ungueltig" });
    const url = mode === "url" || mode === "audio" || (mode === "video" && req.body?.url) ? httpsUrl(req.body?.url) : null;
    if ((mode === "url" || mode === "audio" || (mode === "video" && req.body?.url)) && !url) return res.status(400).json({ error: "Nur https-Adressen" });
    const offer = mode === "share" ? sdp(req.body?.offer) : null;
    if (mode === "share" && !offer) return res.status(400).json({ error: "Angebot ungueltig" });
    const previous = load().mode;
    const session = mode === "share" ? randomBytes(9).toString("hex") : null;
    writeFileSync(file, JSON.stringify({ mode, title: clip(req.body?.title, 200), text: clip(req.body?.text, 1000), url, offer, session, answer: null, video, station: clip(req.body?.station, 100) }), { mode: 0o600 });
    changed();
    res.json({ ok: true, previous, session });
  });
  return r;
}
