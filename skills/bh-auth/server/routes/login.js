import { Router } from "express";
import { safeNext } from "../lib/session.js";
import { loginView, homeView, messageView, setPasswordView, changePasswordView } from "../lib/views.js";
import { MIN_PASSWORD } from "../lib/users.js";

export function loginRoutes({ config, users, sessions, limiter, requireLogin }) {
  const r = Router();
  const html = (res, body, status = 200) => res.status(status).type("html").send(body);
  const badPassword = (p, c) => (String(p).length < MIN_PASSWORD ? `Mindestens ${MIN_PASSWORD} Zeichen.` : p !== c ? "Die Passwörter stimmen nicht überein." : null);

  r.get("/login", async (req, res) => {
    const next = safeNext(req.query.next);
    if (await sessions.resolve(req)) return res.redirect(next);
    html(res, loginView({ next, google: !!config.google, error: req.query.error === "no-access" ? "Für dieses Google-Konto besteht kein Zugang." : req.query.error ? "Anmeldung fehlgeschlagen." : null }));
  });

  r.post("/login", async (req, res) => {
    const email = String(req.body.email || "").toLowerCase();
    const next = safeNext(req.body.next);
    const keys = [`ip:${req.ip}`, `mail:${email}`];
    const view = (error, status) => html(res, loginView({ next, google: !!config.google, error }), status);
    if (keys.some((k) => limiter.blocked(k))) return view("Zu viele Versuche. Bitte später erneut versuchen.", 429);
    const user = await users.checkPassword(email, req.body.password);
    if (!user) { keys.forEach((k) => limiter.fail(k)); return view("E-Mail oder Passwort ist falsch.", 401); }
    keys.forEach((k) => limiter.reset(k));
    await sessions.start(res, user);
    res.redirect(next);
  });

  r.post("/logout", (req, res) => { sessions.end(res); res.redirect("/login"); });

  r.get("/set-password", (req, res) => {
    const user = users.byLink(req.query.token);
    if (!user) return html(res, messageView("Link ungültig", "Dieser Link ist abgelaufen oder wurde bereits verwendet."), 400);
    res.set("Referrer-Policy", "no-referrer");
    html(res, setPasswordView({ token: req.query.token, email: user.email, min: MIN_PASSWORD }));
  });

  r.post("/set-password", async (req, res) => {
    const user = users.byLink(req.body.token);
    if (!user) return html(res, messageView("Link ungültig", "Dieser Link ist abgelaufen oder wurde bereits verwendet."), 400);
    const error = badPassword(req.body.password, req.body.confirm);
    if (error) return html(res, setPasswordView({ error, token: req.body.token, email: user.email, min: MIN_PASSWORD }), 400);
    await users.setPassword(user.id, req.body.password);
    html(res, messageView("Passwort gespeichert", "Du kannst dich jetzt anmelden."));
  });

  r.get("/", requireLogin, (req, res) => html(res, homeView(req.user)));
  r.get("/change-password", requireLogin, (_req, res) => html(res, changePasswordView({ min: MIN_PASSWORD })));

  r.post("/change-password", requireLogin, async (req, res) => {
    const view = (error, status) => html(res, changePasswordView({ error, min: MIN_PASSWORD }), status);
    if (req.user.passwordHash && !(await users.checkPassword(req.user.email, req.body.current))) return view("Das aktuelle Passwort ist falsch.", 400);
    const error = badPassword(req.body.password, req.body.confirm);
    if (error) return view(error, 400);
    await users.setPassword(req.user.id, req.body.password);
    await sessions.start(res, users.byId(req.user.id));
    res.redirect("/");
  });

  return r;
}
