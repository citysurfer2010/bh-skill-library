import { randomBytes } from "node:crypto";
import express from "express";
import sharp from "sharp";

const KEEP = 3; const TTL_MS = 180_000; const WAIT_MS = 25_000; const MAX_BODY = "24mb";

// Pictures for the slideshow: scaled to the Beamer's size, held in memory for minutes only, never written to disk.
export function photoRoutes(r, { reader, writer }) {
  let photos = []; const waiters = new Set();
  const current = () => { const limit = Date.now() - TTL_MS; photos = photos.filter((p) => p.at >= limit); return photos; };
  const latest = () => current()[photos.length - 1] || null;
  const wake = () => [...waiters].forEach((w) => w());
  const describe = (p) => (p.done ? { id: p.id, done: true, empty: p.empty } : { id: p.id, caption: p.caption });
  const add = (entry) => { photos = [...current(), { id: randomBytes(9).toString("hex"), at: Date.now(), ...entry }].slice(-KEEP); wake(); };

  r.post("/screen-photo", express.json({ limit: MAX_BODY }), async (req, res) => {
    if (!writer(req)) return res.status(401).json({ error: "unauthorized" });
    if (req.body?.done) { add({ done: true, empty: !!req.body.empty }); return res.status(204).end(); }
    let jpeg;
    try {
      jpeg = await sharp(Buffer.from(String(req.body?.data || ""), "base64"), { failOn: "none" }).rotate().resize(1920, 1080, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    } catch { return res.status(422).json({ error: "kein Bild" }); }
    add({ jpeg, caption: String(req.body?.caption ?? "").slice(0, 120) });
    res.status(204).end();
  });

  // The Beamer waits here for the next picture; the answer comes at once when one is ready.
  r.get("/screen/:token/photo-wait", (req, res, next) => {
    if (!reader(req.params.token)) return next();
    const after = String(req.query.after || "");
    const ready = () => { const p = latest(); return p && p.id !== after ? p : null; };
    const hit = ready();
    if (hit) return res.json(describe(hit));
    let finished = false;
    const finish = (send) => { if (finished) return; finished = true; clearTimeout(timer); waiters.delete(check); if (send) { const p = ready(); res.json(p ? describe(p) : { id: null }); } };
    const check = () => { if (ready()) finish(true); };
    const timer = setTimeout(() => finish(true), WAIT_MS);
    waiters.add(check);
    res.on("close", () => finish(false));
  });

  r.get("/screen/:token/photo/:id", (req, res, next) => {
    if (!reader(req.params.token)) return next();
    const p = current().find((x) => x.id === req.params.id && x.jpeg);
    if (!p) return res.status(404).end();
    res.set("Cache-Control", "no-store").type("image/jpeg").send(p.jpeg);
  });

  return { clear: () => { photos = []; } };
}
