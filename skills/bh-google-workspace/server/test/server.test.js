'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('alle Werkzeuge laden, Namen sind eindeutig', () => {
  const { TOOL_NAMES, TOOL_SCHEMAS } = require('../tools/index.js');
  assert.ok(TOOL_NAMES.length > 50);
  assert.equal(new Set(TOOL_NAMES).size, TOOL_NAMES.length);
  for (const t of TOOL_SCHEMAS) assert.ok(t.description && t.inputSchema, t.name);
});

test('Anmeldung spricht nur Google an', () => {
  for (const f of ['lib/auth.js', 'lib/config.js', 'lib/oauth-login.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /geminicli|REFRESH_URL/);
  }
});

test('fehlende Anmeldung zerstoert nichts und meldet klar', async () => {
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-'));
  for (const k of Object.keys(require.cache)) if (k.includes('/lib/')) delete require.cache[k];
  const { getAccessToken } = require('../lib/auth.js');
  await assert.rejects(getAccessToken(), /credentials\.json/);
});

test('Dateischutz: erlaubt Arbeitsordner, sperrt Schluessel', () => {
  const home = os.homedir();
  delete require.cache[require.resolve('../lib/local-file-guard.cjs')];
  const guard = require('../lib/local-file-guard.cjs');
  fs.mkdirSync(path.join(os.tmpdir(), 'bh-g'), { recursive: true });
  const ok = path.join(os.tmpdir(), 'bh-g', 'a.pdf'); fs.writeFileSync(ok, 'x');
  assert.equal(guard.checkReadablePath(ok).ok, true);
  assert.equal(guard.checkReadablePath('/etc/passwd').ok, false);
  assert.equal(guard.checkReadablePath(path.join(home, '.ssh', 'id_ed25519')).ok, false);
});

test('Anmeldung: fremde Adresse wird abgewiesen, Code nur mit passendem state', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-l-'));
  process.env.HOME = home;
  const dir = path.join(home, '.config/bh-google-workspace'); fs.mkdirSync(dir, { recursive: true });
  const secret = path.join(dir, 'cs.json'); process.env.GOOGLE_CLIENT_SECRET_FILE = secret;
  fs.writeFileSync(secret, JSON.stringify({ installed: { client_id: 'i', client_secret: 's' } }));
  for (const k of Object.keys(require.cache)) if (k.includes('/lib/')) delete require.cache[k];
  const { startLogin, finishLogin } = require('../lib/oauth-login.js');
  const u = new URL(startLogin({ readOnly: true }));
  assert.match(u.searchParams.get('scope'), /gmail\.readonly/);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  await assert.rejects(finishLogin('http://localhost:8765/?state=falsch&code=c', () => assert.fail()), /gehoert nicht/);
  const state = u.searchParams.get('state');
  await finishLogin(`http://localhost:8765/?state=${state}&code=c`, async (_u, init) => {
    assert.ok(new URLSearchParams(init.body).get('code_verifier'));
    return { ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) };
  });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'credentials.json'), 'utf8')).refresh_token, 'r');
  assert.equal(fs.statSync(path.join(dir, 'credentials.json')).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(dir, 'login-pending.json')), false);
  delete process.env.GOOGLE_CLIENT_SECRET_FILE;
});
