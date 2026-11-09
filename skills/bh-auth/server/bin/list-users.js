#!/usr/bin/env node
// Für den Abgleich der Arbeitsumgebungen: E-Mail je aktivem User, der seine Einladung angenommen hat.
import { loadConfig } from "../lib/config.js";
import { openDb } from "../lib/db.js";
import { usersStore } from "../lib/users.js";

for (const u of usersStore(openDb(loadConfig().dataDir)).list()) {
  if (!u.disabled && (u.passwordHash || u.googleSub)) console.log(u.email);
}
