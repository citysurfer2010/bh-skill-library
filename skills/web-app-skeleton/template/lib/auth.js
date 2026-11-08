// Wer angemeldet ist, sagt der BH-Auth-Dienst per Kopfzeilen. Vertraut wird ihnen nur mit
// TRUST_PROXY_AUTH=1, also nur, wenn die App ausschliesslich hinter dem Proxy erreichbar ist.
const ROLES = ["user", "admin"];
const normalRole = (r) => (ROLES.includes(r) ? r : "user");

export function currentUser(req, _res, next) {
  const trusted = process.env.TRUST_PROXY_AUTH === "1";
  const email = trusted ? req.get("x-user-email") : process.env.DEV_USER_EMAIL;
  const role = trusted ? req.get("x-user-role") : process.env.DEV_USER_ROLE;
  const name = trusted ? req.get("x-user-name") : null;
  req.user = email ? { email, name: name || email, role: normalRole(role) } : null;
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Nicht angemeldet" });
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Nicht angemeldet" });
    if (req.user.role !== role) return res.status(403).json({ error: "Keine Berechtigung" });
    next();
  };
}
