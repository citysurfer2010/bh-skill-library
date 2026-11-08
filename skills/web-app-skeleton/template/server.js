import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./lib/db.js";
import { currentUser, requireUser } from "./lib/auth.js";
import { apiRouter } from "./routes/api.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ db = openDb() } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true, app: "{{SLUG}}" }));
  app.use(currentUser);
  app.use("/api", requireUser, apiRouter(db));
  app.use(express.static(path.join(here, "public")));
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Interner Fehler" });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || {{PORT}});
  const host = process.env.HOST || "127.0.0.1";
  createApp().listen(port, host, () => console.log(`{{SLUG}} auf ${host}:${port}`));
}
