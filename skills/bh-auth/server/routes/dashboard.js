import { Router } from "express";
import { validAppUrl } from "../lib/apps.js";
import { adminAppsView, dashboardView, profileView } from "../lib/views-dashboard.js";

export function dashboardRoutes({ users, apps, sessions, requireLogin, requireAdmin }) {
  const r = Router();
  const html = (res, body, status = 200) => res.status(status).type("html").send(body);
  const adminPage = (req, res, error, status = 200) => html(res, adminAppsView({ me: req.user, apps: apps.list({ admin: true }), error }), status);

  r.get("/", requireLogin, (req, res) => html(res, dashboardView(req.user, apps.list({ admin: !!req.user.isAdmin }))));

  r.get("/profile", requireLogin, (req, res) => html(res, profileView({ user: req.user, saved: req.query.saved === "1" })));
  r.post("/profile", requireLogin, (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 80) return html(res, profileView({ user: req.user, error: "Bitte einen Namen mit höchstens 80 Zeichen angeben." }), 400);
    users.setName(req.user.id, name);
    res.redirect("/profile?saved=1");
  });
  r.post("/profile/sessions", requireLogin, async (req, res) => {
    users.invalidateSessions(req.user.id);
    await sessions.start(res, users.byId(req.user.id));
    res.redirect("/profile?saved=1");
  });

  r.get("/admin/apps", requireAdmin, (req, res) => adminPage(req, res));
  r.post("/admin/apps", requireAdmin, (req, res) => {
    const name = String(req.body.name || "").trim();
    const url = validAppUrl(req.body.url);
    if (!name || name.length > 60) return adminPage(req, res, "Bitte einen Namen angeben.", 400);
    if (!url) return adminPage(req, res, "Bitte eine https-Adresse oder einen Pfad angeben.", 400);
    apps.create({ name, description: String(req.body.description || "").trim().slice(0, 120), url, adminOnly: req.body.adminOnly === "1" });
    res.redirect("/admin/apps");
  });
  r.post("/admin/apps/:id/delete", requireAdmin, (req, res) => { apps.remove(req.params.id); res.redirect("/admin/apps"); });
  return r;
}
