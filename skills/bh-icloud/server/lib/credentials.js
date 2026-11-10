/** Per-user iCloud login, stored by the gateway when the user connects iCloud in the profile. */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const RECONNECT = 'bitte im Profil unter Verbundene Dienste iCloud neu verbinden.';
// After a rejected login nothing is tried again for a while: repeated failures can lock the Apple account.
const LOCK_MS = 60 * 60_000;
const MAIL_MISSING = 'iCloud-Mail ist für dieses Konto nicht eingerichtet. Dafür braucht es eine @icloud.com-Adresse, die sich im Profil unter Verbundene Dienste als iCloud-Mail-Adresse ergänzen lässt. Kalender und Kontakte funktionieren davon unabhängig.';

const dir = () => path.join(process.env.HOME || os.homedir(), '.config', 'bh-icloud');
const marker = (kind) => path.join(dir(), `.rejected-${kind}`);

function assertNotLocked(kind) {
  let age;
  try { age = Date.now() - fs.statSync(marker(kind)).mtimeMs; } catch { return; }
  if (kind === 'mail') throw new Error(MAIL_MISSING); // Stays until the user adds an address: retrying only collects rejected logins.
  if (age < LOCK_MS) throw new Error(`iCloud hat die letzte Anmeldung abgelehnt, weitere Versuche sind gesperrt: ${RECONNECT}`);
}

function markRejected(kind) {
  fs.writeFileSync(marker(kind), '', { mode: 0o600 });
}

// kind is "dav" or "mail": a wrong mail address must not block the calendar.
function credentials(kind) {
  let text;
  try { text = fs.readFileSync(path.join(dir(), '.env'), 'utf8'); } catch {
    throw new Error('iCloud noch nicht verbunden: bitte im Profil unter Verbundene Dienste iCloud verbinden (Skill bh-icloud).');
  }
  assertNotLocked(kind);
  const get = (k) => (text.split('\n').find((l) => l.startsWith(`${k}=`)) || '').slice(k.length + 1);
  const appleId = get('BH_ICLOUD_APPLE_ID');
  return { appleId, password: get('BH_ICLOUD_PASSWORD'), mailUser: get('BH_ICLOUD_MAIL_USER') || appleId };
}

// Tool results are JSON text; failures become readable tool errors.
const guarded = (fn) => async (args = {}) => {
  try { return { content: [{ type: 'text', text: JSON.stringify(await fn(args)) }] }; }
  catch (e) { return { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true }; }
};

const clamp = (value, fallback, max) => Math.min(Math.max(1, Math.trunc(Number(value)) || fallback), max);

module.exports = { credentials, markRejected, guarded, clamp, RECONNECT, MAIL_MISSING };
