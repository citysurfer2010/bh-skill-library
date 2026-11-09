import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { storeIcloudLogin, icloudStatus, removeIcloud, icloudLogin } from "../server/lib/connect-icloud.mjs";
import { createGateway } from "../server/gateway.mjs";

const PASS = "abcd-efgh-ijkl-mnop";
function users(...names) {
  const dir = mkdtempSync(path.join(tmpdir(), "icloud-connect-"));
  for (const n of names) mkdirSync(path.join(dir, n));
  return dir;
}
const file = (d, u) => path.join(d, u, ".config/bh-icloud/.env");

test("valid login is checked, saved with mode 600 and clears old rejections", async () => {
  const d = users("anna");
  mkdirSync(path.dirname(file(d, "anna")), { recursive: true });
  writeFileSync(path.join(path.dirname(file(d, "anna")), ".rejected-dav"), "");
  const r = await storeIcloudLogin(d, { user: "anna", appleId: "a@example.org", password: PASS, mailUser: "a@icloud.com" }, async () => true);
  assert.equal(r.status, 200);
  assert.equal(readFileSync(file(d, "anna"), "utf8"), `BH_ICLOUD_APPLE_ID=a@example.org\nBH_ICLOUD_PASSWORD=${PASS}\nBH_ICLOUD_MAIL_USER=a@icloud.com\n`);
  assert.equal(statSync(file(d, "anna")).mode & 0o777, 0o600);
  assert.deepEqual(icloudStatus(d, { user: "anna" }), { status: 200, connected: true, appleId: "a@example.org", rejected: false });
});

test("mail address defaults to the Apple ID; users stay separate; removal deletes the login", async () => {
  const d = users("anna", "ben");
  await storeIcloudLogin(d, { user: "anna", appleId: "a@icloud.com", password: PASS, mailUser: "" }, async () => true);
  assert.match(readFileSync(file(d, "anna"), "utf8"), /BH_ICLOUD_MAIL_USER=a@icloud.com/);
  assert.equal(existsSync(file(d, "ben")), false);
  assert.equal(icloudStatus(d, { user: "ben" }).connected, false);
  removeIcloud(d, { user: "anna" });
  assert.equal(existsSync(file(d, "anna")), false);
  assert.equal(icloudStatus(d, { user: "anna" }).connected, false);
});

test("unknown or malformed user is refused", async () => {
  const d = users("anna");
  for (const user of ["ben", "../anna", ""]) assert.equal((await storeIcloudLogin(d, { user, appleId: "a@b.de", password: PASS }, async () => assert.fail("no login expected"))).status, 404);
});

test("a normal Apple password is refused before anything is sent", async () => {
  const d = users("anna3");
  const r = await storeIcloudLogin(d, { user: "anna3", appleId: "a@example.org", password: "MeinPasswort1!" }, async () => assert.fail("no login expected"));
  assert.equal(r.status, 400); assert.match(r.error, /app-spezifisches/); assert.equal(existsSync(file(d, "anna3")), false);
});

test("line breaks cannot inject settings", async () => {
  const d = users("anna4");
  assert.equal((await storeIcloudLogin(d, { user: "anna4", appleId: "a@b\nBH_X=1", password: PASS }, async () => assert.fail("no login expected"))).status, 400);
});

test("failed logins are limited per user so the Apple account is not locked", async () => {
  const d = users("ben"); const body = { user: "ben", appleId: "a@example.org", password: PASS };
  let calls = 0; const login = async () => { calls++; return false; };
  for (let i = 0; i < 5; i++) assert.equal((await storeIcloudLogin(d, body, login)).status, 400);
  assert.equal((await storeIcloudLogin(d, body, login)).status, 429);
  assert.equal(calls, 5); assert.equal(existsSync(file(d, "ben")), false);
});

test("gateway routes need the connect secret", async () => {
  const d = users("cara");
  const tokensFile = path.join(d, "t.json"); writeFileSync(tokensFile, JSON.stringify({ tok: "devbox/cara" }));
  const server = createGateway({ servers: [], tokensFile, usersDir: d, connectSecret: "geheim", loginIcloud: async () => true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const post = (route, body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const body = { user: "cara", appleId: "a@b.de", password: PASS };
  try {
    assert.equal((await post("/connect/icloud", body)).status, 401);
    assert.equal((await post("/connect/icloud", body, { authorization: "Bearer tok" })).status, 401);
    assert.equal((await post("/connect/icloud", body, { "x-connect-secret": "geheim" })).status, 200);
    assert.equal((await (await post("/connect/icloud/status", { user: "cara" }, { "x-connect-secret": "geheim" })).json()).connected, true);
    assert.equal((await post("/connect/icloud/remove", { user: "cara" }, { "x-connect-secret": "geheim" })).status, 200);
    assert.equal(existsSync(file(d, "cara")), false);
  } finally { await new Promise((r) => { server.closeAllConnections(); server.close(r); }); }
});

const reply = (status, location) => ({ status, headers: new Headers(location ? { location } : {}) });

test("login check: 207 true, 401 false, follows only icloud.com", async () => {
  assert.equal(await icloudLogin("a", "b", async () => reply(207)), true);
  assert.equal(await icloudLogin("a", "b", async () => reply(401)), false);
  const seen = [];
  await assert.rejects(icloudLogin("a", "b", async (u) => { seen.push(u.hostname); return reply(302, "https://evil.example/"); }), /nicht erreichbar/);
  assert.deepEqual(seen, ["caldav.icloud.com"]);
  let n = 0;
  assert.equal(await icloudLogin("a", "b", async () => (n++ ? reply(207) : reply(301, "https://p1-caldav.icloud.com/"))), true);
  await assert.rejects(icloudLogin("a", "b", async () => reply(503)), /nicht erreichbar/);
});
