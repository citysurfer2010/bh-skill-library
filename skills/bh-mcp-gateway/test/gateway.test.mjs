import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGateway } from "../server/gateway.mjs";
import { storeGithubToken } from "../server/lib/connect.mjs";

const stub = path.join(import.meta.dirname, "stub-server.mjs");

async function start() {
  const dir = mkdtempSync(path.join(tmpdir(), "gw-"));
  const tokensFile = path.join(dir, "t.json");
  writeFileSync(tokensFile, JSON.stringify({ tokA: "devbox/anna", tokB: "devbox/ben", bad: "fremd/xx" }));
  const server = createGateway({ servers: [{ id: "demo", command: [process.execPath, stub] }], tokensFile, usersDir: path.join(dir, "u") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rpc = async (token, method, params) => {
    const r = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return { status: r.status, body: await r.json() };
  };
  return { base, dir, rpc, stop: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

test("ohne, mit falschem und mit fremdem Token: 401", async () => {
  const g = await start();
  try {
    for (const t of [null, "nope", "bad"]) assert.equal((await g.rpc(t, "tools/list")).status, 401, String(t));
    assert.equal((await fetch(`${g.base}/health`)).status, 200);
  } finally { await g.stop(); }
});

test("Werkzeuge bekommen Praefix, Punkte werden ersetzt", async () => {
  const g = await start();
  try {
    const { body } = await g.rpc("tokA", "tools/list");
    assert.deepEqual(body.result.tools.map((t) => t.name), ["demo_a_who"]);
  } finally { await g.stop(); }
});

test("jeder User laeuft in seinem eigenen Home", async () => {
  const g = await start();
  try {
    const text = async (t) => (await g.rpc(t, "tools/call", { name: "demo_a_who", arguments: {} })).body.result.content[0].text;
    assert.equal(await text("tokA"), `a.who:${path.join(g.dir, "u", "anna")}:`);
    assert.equal(await text("tokB"), `a.who:${path.join(g.dir, "u", "ben")}:`);
  } finally { await g.stop(); }
});

test("Gateway-Umgebung erreicht die Werkzeuge nicht", async () => {
  process.env.SECRET_LEAK = "geheim";
  const g = await start();
  try {
    const r = await g.rpc("tokA", "tools/call", { name: "demo_a_who", arguments: {} });
    assert.doesNotMatch(r.body.result.content[0].text, /geheim/);
  } finally { delete process.env.SECRET_LEAK; await g.stop(); }
});

test("unbekanntes Werkzeug wird gemeldet", async () => {
  const g = await start();
  try { assert.match((await g.rpc("tokA", "tools/call", { name: "x", arguments: {} })).body.error.message, /Unbekanntes/); }
  finally { await g.stop(); }
});

test("GitHub-Token: nur gueltige werden gespeichert, mit Rechten 600", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "h-"));
  const file = path.join(home, ".config/bh-github/token");
  assert.equal((await storeGithubToken(home, "zu kurz")).status, 400);
  assert.equal((await storeGithubToken(home, "a".repeat(40), async () => ({ ok: false }))).status, 400);
  assert.equal(existsSync(file), false);
  const ok = await storeGithubToken(home, "a".repeat(40), async () => ({ ok: true, json: async () => ({ login: "me" }) }));
  assert.equal(ok.login, "me");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(readFileSync(file, "utf8"), "a".repeat(40));
});
