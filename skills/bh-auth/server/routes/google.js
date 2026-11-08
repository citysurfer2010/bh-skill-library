import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { safeNext } from "../lib/session.js";

const COOKIE = "bh_oauth";
const b64 = (b) => b.toString("base64url");

// Google bestaetigt nur, wem ein Konto gehoert. Zugang haben ausschliesslich eingeladene Adressen.
export function googleRoutes({ config, users, sessions }) {
  const r = Router();
  const redirectUri = `${config.publicUrl}/oauth/google/callback`;
  const cookie = { httpOnly: true, sameSite: "lax", secure: config.secure, path: "/oauth/google" };
  const fail = (res, kind = "1") => { res.clearCookie(COOKIE, cookie); res.redirect(`/login?error=${kind}`); };

  r.get("/oauth/google", (req, res) => {
    if (!config.google) return res.redirect("/login");
    const state = b64(randomBytes(24));
    const verifier = b64(randomBytes(48));
    res.cookie(COOKIE, JSON.stringify({ state, verifier, next: safeNext(req.query.next) }), { ...cookie, maxAge: 600_000 });
    const q = new URLSearchParams({
      client_id: config.google.clientId, redirect_uri: redirectUri, response_type: "code",
      scope: "openid email profile", prompt: "select_account", state,
      code_challenge: b64(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  });

  r.get("/oauth/google/callback", async (req, res) => {
    if (!config.google) return res.redirect("/login");
    let saved;
    try { saved = JSON.parse(req.cookies[COOKIE]); } catch { return fail(res); }
    if (!saved.state || req.query.state !== saved.state || !req.query.code) return fail(res);
    try {
      const token = await config.fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: String(req.query.code), client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: saved.verifier }),
      });
      if (!token.ok) return fail(res);
      const { access_token: accessToken } = await token.json();
      const info = await config.fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } });
      if (!info.ok) return fail(res);
      const g = await info.json();
      if (!g.sub || !g.email || g.email_verified !== true) return fail(res, "no-access");
      const user = users.byEmail(g.email);
      if (!user || user.disabled || (user.googleSub && user.googleSub !== g.sub)) return fail(res, "no-access");
      if (!user.googleSub) users.bindGoogle(user.id, g.sub);
      res.clearCookie(COOKIE, cookie);
      await sessions.start(res, users.byId(user.id));
      res.redirect(safeNext(saved.next));
    } catch (e) {
      console.error(`[google] ${e.message}`);
      fail(res);
    }
  });

  return r;
}
