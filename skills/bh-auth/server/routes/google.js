import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { safeNext } from "../lib/session.js";
import { storeServices } from "../lib/google-services.js";

const COOKIE = "bh_oauth";
const b64 = (b) => b.toString("base64url");
const G = "https://www.googleapis.com/auth/";
const SERVICES = ["openid", "email", "profile", ...["gmail.modify", "drive", "calendar", "documents", "spreadsheets", "presentations", "tasks"].map((s) => G + s)].join(" ");

// Google bestaetigt nur, wem ein Konto gehoert. Zugang haben eingeladene Adressen und Konten,
// die ein angemeldeter User selbst mit seinem Profil verknuepft hat.
export function googleRoutes({ config, users, sessions, avatars, requireLogin }) {
  const r = Router();
  const redirectUri = `${config.publicUrl}/oauth/google/callback`;
  const cookie = { httpOnly: true, sameSite: "lax", secure: config.secure, path: "/oauth/google" };
  const fail = (res, kind = "1") => { res.clearCookie(COOKIE, cookie); res.redirect(`/login?error=${kind}`); };

  function toGoogle(res, payload, extra = {}) {
    const state = b64(randomBytes(24));
    const verifier = b64(randomBytes(48));
    res.cookie(COOKIE, JSON.stringify({ state, verifier, ...payload }), { ...cookie, maxAge: 600_000 });
    const q = new URLSearchParams({
      client_id: config.google.clientId, redirect_uri: redirectUri, response_type: "code",
      scope: "openid email profile", prompt: "select_account", state,
      code_challenge: b64(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256", ...extra,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  }

  r.get("/oauth/google", (req, res) => {
    if (!config.google) return res.redirect("/login");
    toGoogle(res, { next: safeNext(req.query.next, config.returnOrigins) });
  });

  r.get("/oauth/google/link", requireLogin, (req, res) => {
    if (!config.google) return res.redirect("/profile");
    toGoogle(res, { linkUid: req.user.id });
  });

  // Kalender, Drive und Co. sind eine eigene Zustimmung, getrennt von der reinen Anmeldung.
  r.get("/oauth/google/services", requireLogin, (req, res) => {
    if (!config.google || !config.connect.secret) return res.redirect("/profile");
    toGoogle(res, { servicesUid: req.user.id }, { scope: SERVICES, access_type: "offline", prompt: "consent" });
  });

  r.get("/oauth/google/callback", async (req, res) => {
    if (!config.google) return res.redirect("/login");
    let saved;
    try { saved = JSON.parse(req.cookies[COOKIE]); } catch { return fail(res); }
    if (saved.servicesUid && saved.state && req.query.state === saved.state && !req.query.code) {
      res.clearCookie(COOKIE, cookie);
      return res.redirect("/profile?google=services-denied");
    }
    if (!saved.state || req.query.state !== saved.state || !req.query.code) return fail(res);
    try {
      const token = await config.fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: String(req.query.code), client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: saved.verifier }),
      });
      if (!token.ok) return fail(res);
      const granted = await token.json();
      const { access_token: accessToken } = granted;
      if (saved.servicesUid) {
        const me = await sessions.resolve(req);
        if (!me || me.id !== saved.servicesUid) return fail(res);
        res.clearCookie(COOKIE, cookie);
        const who = await config.fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } });
        const account = who.ok ? (await who.json()).email : null;
        const stored = !!granted.refresh_token && await storeServices(config, me, granted, account);
        return res.redirect(stored ? "/profile?saved=google-services" : "/profile?google=services-failed");
      }
      const info = await config.fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } });
      if (!info.ok) return fail(res);
      const g = await info.json();
      if (!g.sub || !g.email || g.email_verified !== true) return fail(res, "no-access");
      if (saved.linkUid) {
        const me = await sessions.resolve(req);
        if (!me || me.id !== saved.linkUid) return fail(res);
        const holder = users.byGoogleSub(g.sub);
        res.clearCookie(COOKIE, cookie);
        if (holder && holder.id !== me.id) return res.redirect("/profile?google=taken");
        users.bindGoogle(me.id, g.sub, g.email);
        await avatars.fromGoogle(me.id, g.picture);
        return res.redirect("/profile?saved=google");
      }
      const user = users.byGoogleSub(g.sub) || users.byEmail(g.email);
      if (!user || user.disabled || (user.googleSub && user.googleSub !== g.sub)) return fail(res, "no-access");
      users.bindGoogle(user.id, g.sub, g.email);
      await avatars.fromGoogle(user.id, g.picture);
      res.clearCookie(COOKIE, cookie);
      await sessions.start(res, users.byId(user.id));
      res.redirect(safeNext(saved.next, config.returnOrigins));
    } catch (e) {
      console.error(`[google] ${e.message}`);
      fail(res);
    }
  });

  return r;
}
