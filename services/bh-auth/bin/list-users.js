#!/usr/bin/env node
// For reconciling workspaces: email per active user who has accepted their invitation.
import { loadConfig } from "../lib/config.js";
import { openDb } from "../lib/db.js";
import { usersStore } from "../lib/users.js";

for (const u of usersStore(openDb(loadConfig().dataDir)).list()) {
  if (!u.disabled && (u.passwordHash || u.googleSub)) console.log(u.email);
}
