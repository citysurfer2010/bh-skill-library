import { Router } from "express";

// For other apps: nginx calls /auth-headers via auth_request, no other service needs the key.
export function verifyRoutes({ sessions }) {
  const r = Router();
  r.get("/health", (_req, res) => res.json({ ok: true }));
  r.get("/auth-headers", async (req, res) => {
    const u = await sessions.resolve(req);
    if (!u) return res.status(401).end();
    res.set({ "X-Auth-Email": u.email, "X-Auth-Name": encodeURIComponent(u.name), "X-Auth-Role": u.isAdmin ? "admin" : "user" }).status(204).end();
  });
  r.get("/validate", async (req, res) => {
    const u = await sessions.resolve(req);
    if (!u) return res.status(401).json({ valid: false });
    res.json({ valid: true, email: u.email, name: u.name, role: u.isAdmin ? "admin" : "user" });
  });
  return r;
}
