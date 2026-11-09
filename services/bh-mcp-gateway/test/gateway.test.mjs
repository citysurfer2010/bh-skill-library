import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGateway } from "../server/gateway.mjs";
import { storeGithubToken } from "../server/lib/connect.mjs";

const stub = path.join(import.meta.dirname, "stub-server.mjs");

async function start({ loginNas, servers = [{ id: "demo", command: [process.execPath, stub] }] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "gw-"));
  const tokensFile = path.join(dir, "t.json");
  writeFileSync(tokensFile, JSON.stringify({ tokA: "devbox/anna", tokB: "devbox/ben", tokApp: "app/bh-apps", bad: "fremd/xx" }));
  const server = createGateway({ servers, tokensFile, usersDir: path.join(dir, "u"), loginNas });
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

async function connectNas(g, token, body) {
  return fetch(`${g.base}/connect/nas`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("Synology verbinden: geprueft, je User getrennt, Rechte 600", async () => {
  const g = await start({ loginNas: async (u, p) => u === "anna" && p === "gut" });
  try {
    assert.equal((await fetch(`${g.base}/connect/nas`, { method: "POST", body: "{}" })).status, 401);
    assert.equal((await connectNas(g, "tokA", { user: "anna", password: "falsch" })).status, 400);
    assert.equal(existsSync(path.join(g.dir, "u/anna/.config/bh-nas/.env")), false);
    assert.equal((await connectNas(g, "tokA", { user: "anna", password: "gut" })).status, 200);
    const file = path.join(g.dir, "u/anna/.config/bh-nas/.env");
    assert.equal(readFileSync(file, "utf8"), "BH_NAS_USER=anna\nBH_NAS_PASSWORD=gut\n");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(existsSync(path.join(g.dir, "u/ben/.config/bh-nas/.env")), false);
  } finally { await g.stop(); }
});

test("Synology verbinden: Versuche sind begrenzt, Zeilenumbrueche verboten", async () => {
  const g = await start({ loginNas: async () => false });
  try {
    assert.equal((await connectNas(g, "tokB", { user: "a\nb", password: "x" })).status, 400);
    for (let i = 0; i < 5; i++) assert.equal((await connectNas(g, "tokB", { user: "ben", password: "x" })).status, 400);
    assert.equal((await connectNas(g, "tokB", { user: "ben", password: "x" })).status, 429);
  } finally { await g.stop(); }
});

test("Server mit users-Liste: andere sehen ihn nicht und koennen ihn nicht aufrufen", async () => {
  const g = await start({ servers: [{ id: "demo", command: [process.execPath, stub] }, { id: "privat", command: [process.execPath, stub], users: ["anna"] }] });
  try {
    const names = async (t) => (await g.rpc(t, "tools/list")).body.result.tools.map((x) => x.name);
    assert.deepEqual(await names("tokA"), ["demo_a_who", "privat_a_who"]);
    assert.deepEqual(await names("tokB"), ["demo_a_who"]);
    assert.match((await g.rpc("tokB", "tools/call", { name: "privat_a_who", arguments: {} })).body.error.message, /Unbekanntes/);
  } finally { await g.stop(); }
});


test("Dienst-Konto startet nur ausdruecklich freigegebene Server", async () => {
  const { Registry } = await import("../server/lib/registry.mjs");
  const started = [];
  const pool = { get: (user, s) => { started.push(s.id); return { request: async () => ({ tools: [{ name: "x" }] }) }; } };
  const reg = new Registry([{ id: "offen" }, { id: "beamer", users: ["bh-apps"] }], pool);
  const list = await reg.list("bh-apps");
  assert.deepEqual(list.map((t) => t.name), ["beamer_x"]);
  assert.deepEqual(started, ["beamer"]);
});

test("Dienst-Konto darf offene Server nur mit Freigabe nutzen", async () => {
  const { Registry } = await import("../server/lib/registry.mjs");
  const pool = { get: () => ({ request: async () => ({ tools: [{ name: "x" }] }) }) };
  const reg = new Registry([{ id: "bvg", services: ["bh-apps"] }, { id: "offen" }], pool);
  assert.deepEqual((await reg.list("bh-apps")).map((t) => t.name), ["bvg_x"]);
});
