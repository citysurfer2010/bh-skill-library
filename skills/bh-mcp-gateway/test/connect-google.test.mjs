import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGateway } from "../server/gateway.mjs";

const revoked = [];
async function start() {
  const usersDir = mkdtempSync(path.join(os.tmpdir(), "gw-"));
  mkdirSync(path.join(usersDir, "anna"));
  const tokensFile = path.join(usersDir, "tokens.json"); writeFileSync(tokensFile, "{}");
  const srv = createGateway({ servers: [], tokensFile, usersDir, connectSecret: "geheim", fetchGoogle: async (u, o) => { revoked.push([u, String(o.body)]); return { ok: true }; } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (url, body, secret = "geheim") => fetch(base + url, { method: "POST", headers: { "x-connect-secret": secret }, body: JSON.stringify(body) });
  return { usersDir, post, close: () => new Promise((r) => srv.close(r)) };
}
const full = { user: "anna", access_token: "a", refresh_token: "r", client_id: "c", client_secret: "s", expires_in: 60 };

test("Google-Freigabe: nur mit Geheimnis, nur für bekannte User, Datei geschützt", async () => {
  const g = await start();
  try {
    assert.equal((await g.post("/connect/google", full, "falsch")).status, 401);
    assert.equal((await g.post("/connect/google", { ...full, user: "../anna" })).status, 404);
    assert.equal((await g.post("/connect/google", { ...full, user: "bob" })).status, 404);
    assert.equal((await g.post("/connect/google", { ...full, refresh_token: "" })).status, 400);
    assert.deepEqual(await (await g.post("/connect/google/status", { user: "anna" })).json(), { connected: false, email: null });
    assert.equal((await g.post("/connect/google", { ...full, email: "a@b.de" })).status, 200);
    assert.deepEqual(await (await g.post("/connect/google/status", { user: "anna" })).json(), { connected: true, email: "a@b.de" });
    const f = path.join(g.usersDir, "anna/.config/bh-google-workspace/credentials.json");
    assert.equal(statSync(f).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(f, "utf8")).refresh_token, "r");
    assert.equal((await g.post("/connect/google/remove", { user: "anna" }, "falsch")).status, 401);
    assert.equal((await g.post("/connect/google/remove", { user: "anna" })).status, 200);
    assert.equal(existsSync(f), false); assert.match(revoked[0][1], /token=r/);
    assert.deepEqual(await (await g.post("/connect/google/status", { user: "anna" })).json(), { connected: false, email: null });
  } finally { await g.close(); }
});
