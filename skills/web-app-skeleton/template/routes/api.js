import { Router } from "express";
import { requireRole } from "../lib/auth.js";

export function apiRouter(db) {
  const router = Router();

  router.get("/me", (req, res) => res.json(req.user));

  router.get("/items", (_req, res) => {
    res.json(db.prepare("SELECT id, title, created_by, created_at FROM items ORDER BY id DESC").all());
  });

  router.post("/items", requireRole("admin"), (req, res) => {
    const title = String(req.body?.title || "").trim();
    if (!title || title.length > 200) return res.status(400).json({ error: "Titel fehlt oder ist zu lang" });
    const r = db.prepare("INSERT INTO items (title, created_by) VALUES (?, ?)").run(title, req.user.email);
    res.status(201).json({ id: Number(r.lastInsertRowid), title });
  });

  router.delete("/items/:id", requireRole("admin"), (req, res) => {
    const r = db.prepare("DELETE FROM items WHERE id = ?").run(Number(req.params.id));
    res.status(r.changes ? 204 : 404).end();
  });

  return router;
}
