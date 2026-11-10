import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGateway } from "../server/gateway.mjs";

const stub = path.join(import.meta.dirname, "stub-server.mjs");

async function start() {
  const dir = mkdtempSync(path.join(tmpdir(), "gw-as-"));
  const tokensFile = path.join(dir, "t.json");
  writeFileSync(tokensFile, JSON.stringify({ tokApp: "app/bh-apps", tokAnna: "devbox/anna" }));
  const server = createGateway({ servers: [{ id: "demo", command: [process.execPath, stub], users: ["anna"] }], tokensFile, usersDir: path.join(dir, "u"), actAsSecret: "geheim" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const list = (token, extra = {}) => fetch(`http://127.0.0.1:${server.address().port}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...extra }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  return { list, stop: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
const as = (user, secret = "geheim") => ({ "x-act-as": user, "x-act-as-secret": secret });

test("the app account sees the tools of the person it acts for", async () => {
  const g = await start();
  try {
    assert.equal((await (await g.list("tokApp")).json()).result.tools.length, 0);
    assert.ok((await (await g.list("tokApp", as("anna"))).json()).result.tools.length > 0);
  } finally { await g.stop(); }
});

test("acting as someone needs the app account, the secret and a real user name", async () => {
  const g = await start();
  try {
    assert.equal((await g.list("tokAnna", as("ben"))).status, 401);
    assert.equal((await g.list("tokApp", as("anna", "falsch"))).status, 401);
    assert.equal((await g.list("tokApp", { "x-act-as": "anna" })).status, 401);
    assert.equal((await g.list("tokApp", as("../anna"))).status, 401);
    assert.equal((await g.list("tokApp", as("bh-apps"))).status, 401);
  } finally { await g.stop(); }
});
