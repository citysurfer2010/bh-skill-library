#!/usr/bin/env node
// Creates the first admin and prints the one-time link: node bin/invite-admin.js <email> <name>
import { loadConfig } from "../lib/config.js";
import { openDb } from "../lib/db.js";
import { usersStore, HOURS } from "../lib/users.js";

const [email, ...name] = process.argv.slice(2);
if (!email || !name.length) { console.error("Aufruf: invite-admin.js <email> <name>"); process.exit(1); }
const config = loadConfig();
const users = usersStore(openDb(config.dataDir));
const user = users.byEmail(email) || users.create({ email, name: name.join(" "), isAdmin: true });
users.setAdmin(user.id, true);
console.log(`Gueltig ${HOURS.invite} Stunden:\n${config.publicUrl}/set-password?token=${users.issueLink(user.id, "invite")}`);
