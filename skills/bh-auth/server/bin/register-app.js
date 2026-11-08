#!/usr/bin/env node
// Traegt eine ausgerollte App in die Uebersicht ein: register-app.js add <titel> <url> [beschreibung] [--admin] | remove <url>
import { loadConfig } from "../lib/config.js";
import { openDb } from "../lib/db.js";
import { appsStore, validAppUrl } from "../lib/apps.js";

const [cmd, ...rest] = process.argv.slice(2);
const db = openDb(loadConfig().dataDir);
const apps = appsStore(db);
const clear = (url) => db.prepare("DELETE FROM apps WHERE url = ?").run(url);

if (cmd === "remove") {
  clear(rest[0]);
} else if (cmd === "add") {
  const admin = rest.includes("--admin");
  const [name, rawUrl, description = ""] = rest.filter((a) => a !== "--admin");
  const url = validAppUrl(rawUrl);
  if (!name || !url) { console.error("Name oder Adresse ungueltig"); process.exit(1); }
  clear(url);
  apps.create({ name, description, url, adminOnly: admin });
} else {
  console.error("Aufruf: register-app.js add|remove");
  process.exit(1);
}
