import { Router } from "express";
import { MIN_PASSWORD, passwordProblem } from "../lib/users.js";
import { profileView } from "../lib/views-profile.js";
import { servicesStatus, removeServices } from "../lib/google-services.js";

const NOTICES = { "google-services": "Google-Dienste sind verbunden.", "google-services-off": "Google-Dienste wurden getrennt.",
  name: "Dein Name wurde gespeichert.", password: "Dein Passwort wurde geändert.", google: "Dein Google-Konto ist verknüpft.",
  unlink: "Die Anmeldung mit Google wurde getrennt.", sessions: "Alle anderen Geräte wurden abgemeldet.",
};

const SERVICE_ERRORS = {
  "services-failed": "Google-Dienste konnten nicht verbunden werden. Bitte versuche es noch einmal.",
  "services-denied": "Du hast die Freigabe bei Google abgebrochen. Es wurde nichts verbunden.",
  "services-off-failed": "Google-Dienste konnten nicht getrennt werden. Bitte versuche es noch einmal.",
};

export function profileRoutes({ config, users, sessions, avatars, requireLogin }) {
  const r = Router();
  const page = async (req, res, extra = {}, status = 200) => {
    const googleServices = await servicesStatus(config, req.user);
    res.status(status).type("html").send(profileView({ user: req.user, googleEnabled: !!config.google, googleServices, min: MIN_PASSWORD, ...extra }));
  };

  r.get("/profile", requireLogin, (req, res) => page(req, res, {
    notice: NOTICES[req.query.saved],
    openPassword: req.query.pw === "1",
    error: req.query.google === "taken" ? "Dieses Google-Konto ist bereits mit einem anderen Benutzer verknüpft." : SERVICE_ERRORS[req.query.google] || null,
  }));
  r.get("/avatar/me", requireLogin, (req, res) => {
    if (!req.user.avatarType) return res.status(204).end();
    res.set({ "Content-Type": req.user.avatarType, "Cache-Control": "private, max-age=3600" }).send(avatars.read(req.user));
  });
  r.get("/change-password", requireLogin, (_req, res) => res.redirect("/profile?pw=1"));

  r.post("/profile", requireLogin, (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 80) return page(req, res, { error: "Bitte einen Namen mit höchstens 80 Zeichen angeben." }, 400);
    users.setName(req.user.id, name);
    res.redirect("/profile?saved=name");
  });

  r.post("/change-password", requireLogin, async (req, res) => {
    const fail = (passwordError) => page(req, res, { passwordError }, 400);
    if (req.user.passwordHash && !(await users.checkPassword(req.user.email, req.body.current))) return fail("Das aktuelle Passwort ist falsch.");
    const problem = passwordProblem(req.body.password, req.body.confirm);
    if (problem) return fail(problem);
    await users.setPassword(req.user.id, req.body.password);
    await sessions.start(res, users.byId(req.user.id));
    res.redirect("/profile?saved=password");
  });

  r.post("/profile/sessions", requireLogin, async (req, res) => {
    users.invalidateSessions(req.user.id);
    await sessions.start(res, users.byId(req.user.id));
    res.redirect("/profile?saved=sessions");
  });

  r.post("/profile/google/services/disconnect", requireLogin, async (req, res) => {
    const done = await removeServices(config, req.user);
    res.redirect(done ? "/profile?saved=google-services-off" : "/profile?google=services-off-failed");
  });

  r.post("/profile/google/unlink", requireLogin, (req, res) => {
    if (!req.user.passwordHash) return page(req, res, { error: "Lege zuerst ein Passwort fest, sonst kannst du dich nicht mehr anmelden." }, 400);
    users.unbindGoogle(req.user.id);
    avatars.remove(req.user);
    res.redirect("/profile?saved=unlink");
  });

  return r;
}
