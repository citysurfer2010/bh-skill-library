import { SignJWT, jwtVerify } from "jose";

const COOKIE = "bh_session";
const ISSUER = "bh-auth";
const DAYS = 7;

export function sessions(config, users) {
  const options = { httpOnly: true, sameSite: "lax", secure: config.secure, domain: config.cookieDomain, path: "/" };
  return {
    async start(res, user) {
      const token = await new SignJWT({ uid: user.id }).setProtectedHeader({ alg: "HS256" })
        .setIssuer(ISSUER).setIssuedAt().setExpirationTime(`${DAYS}d`).sign(config.key);
      users.touchLogin(user.id);
      res.cookie(COOKIE, token, { ...options, maxAge: DAYS * 86400_000 });
    },
    end(res) { res.clearCookie(COOKIE, options); },
    /** Angemeldeter User oder null. Jeder Fehler bedeutet: nicht angemeldet. */
    async resolve(req) {
      try {
        const { payload } = await jwtVerify(req.cookies?.[COOKIE] || "", config.key, { algorithms: ["HS256"], issuer: ISSUER });
        const user = users.byId(payload.uid);
        if (!user || user.disabled || payload.iat < user.tokenInvalidatedAt) return null;
        return user;
      } catch { return null; }
    },
  };
}

/** Nur eigene Pfade oder ausdruecklich freigegebene Adressen, sonst die Startseite. */
export function safeNext(next, origins = []) {
  const n = String(next || "");
  if (/[\r\n]/.test(n)) return "/";
  if (n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\")) return n;
  try {
    const u = new URL(n);
    return origins.includes(u.origin) ? u.href : "/";
  } catch { return "/"; }
}
