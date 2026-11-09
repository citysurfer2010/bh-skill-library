import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import { loadConfig } from "./lib/config.js";
import { openDb } from "./lib/db.js";
import { usersStore } from "./lib/users.js";
import { appsStore } from "./lib/apps.js";
import { avatarStore } from "./lib/avatars.js";
import { sessions as makeSessions } from "./lib/session.js";
import { rateLimiter } from "./lib/rate-limit.js";
import { loginRoutes } from "./routes/login.js";
import { googleRoutes } from "./routes/google.js";
import { adminRoutes } from "./routes/admin.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { profileRoutes } from "./routes/profile.js";
import { screenRoutes } from "./routes/screen.js";
import { verifyRoutes } from "./routes/verify.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ config = loadConfig(), db = openDb(config.dataDir), limiter = rateLimiter() } = {}) {
  const users = usersStore(db);
  const sessions = makeSessions(config, users);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin", "Cache-Control": "no-store, no-transform", "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; manifest-src 'self'; form-action 'self' ${config.returnOrigins.join(" ")}; base-uri 'none'; frame-ancestors 'none'` });
    next();
  });
  // Clients that ignore the icon links still ask for this path.
  app.get("/favicon.ico", (_req, res) => res.redirect(308, "/branding/icon-192.png?v=2"));
  app.use(express.static(path.join(here, "public")));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  // Forms only from our own origin.
  app.use((req, res, next) => {
    const origin = req.get("origin");
    // The Beamer app has no origin of its own; its answer is secured by the secret link, not by cookies.
    const fromBeamer = /^\/screen\/[^/]+\/(answer|request)$/.test(req.path);
    if (req.method === "POST" && origin && origin !== config.publicUrl && !fromBeamer) return res.status(403).send("Ungültige Herkunft");
    next();
  });

  const requireLogin = async (req, res, next) => {
    req.user = await sessions.resolve(req);
    if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    next();
  };
  const requireAdmin = (req, res, next) => requireLogin(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).send("Keine Berechtigung");
    next();
  });

  const apps = appsStore(db);
  const avatars = avatarStore(config, users);
  const deps = { config, users, apps, avatars, sessions, limiter, requireLogin, requireAdmin };
  app.use(screenRoutes(deps));
  app.use(verifyRoutes(deps));
  app.use(googleRoutes(deps));
  app.use(dashboardRoutes(deps));
  app.use(profileRoutes(deps));
  app.use(adminRoutes(deps));
  app.use(loginRoutes(deps));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  createApp({ config }).listen(config.port, "0.0.0.0", () => console.log(`bh-auth auf :${config.port}`));
}
