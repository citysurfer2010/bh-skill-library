import { Router } from "express";
import { adminView } from "../lib/views-admin.js";
import { HOURS } from "../lib/users.js";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function adminRoutes({ config, users, sessions, requireAdmin }) {
  const r = Router();
  const render = (req, res, extra = {}, status = 200) => res.status(status).type("html").send(adminView({ me: req.user, users: users.list(), ...extra }));
  const linkFor = (u, kind) => ({ email: u.email, hours: HOURS[kind], url: `${config.publicUrl}/set-password?token=${users.issueLink(u.id, kind)}` });
  // Der letzte aktive Admin bleibt immer erhalten.
  const target = (req, res) => {
    const u = users.byId(req.params.id);
    if (!u) { res.status(404); render(req, res, { error: "Benutzer nicht gefunden." }, 404); return null; }
    if (u.id === req.user.id && req.params.action !== "link") { render(req, res, { error: "Das eigene Konto kann hier nicht geändert werden." }, 400); return null; }
    return u;
  };

  r.use("/admin", requireAdmin);
  r.get("/admin", (req, res) => render(req, res));

  r.post("/admin/users", (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!EMAIL.test(email)) return render(req, res, { error: "Bitte eine gültige E-Mail angeben." }, 400);
    if (users.byEmail(email)) return render(req, res, { error: "Diese E-Mail ist bereits angelegt." }, 409);
    const u = users.create({ email, name: req.body.name, isAdmin: req.body.isAdmin === "1" });
    render(req, res, { link: linkFor(u, "invite") });
  });

  r.post("/admin/users/:id/:action", (req, res) => {
    const u = target(req, res);
    if (!u) return;
    switch (req.params.action) {
      case "link": return render(req, res, { link: linkFor(u, "reset") });
      case "admin": users.setAdmin(u.id, !u.isAdmin); users.invalidateSessions(u.id); break;
      case "disable": users.setDisabled(u.id, !u.disabled); break;
      case "delete": users.remove(u.id); break;
      default: return render(req, res, { error: "Unbekannte Aktion." }, 404);
    }
    res.redirect("/admin");
  });

  return r;
}
