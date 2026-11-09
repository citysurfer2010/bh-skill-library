import test from "node:test";
import assert from "node:assert/strict";
import { start } from "./helpers.js";

test("Admin-Bereich: anonym zur Anmeldung, User 403, Admin 200", async () => {
  const g = await start();
  try {
    await g.addUser("u@b.de"); await g.addUser("a@b.de", { admin: true });
    assert.equal((await g.client()("/admin")).status, 302);
    const u = g.client(); await g.login(u, "u@b.de");
    assert.equal((await u("/admin")).status, 403);
    assert.equal((await u("/admin/users", { form: { email: "x@b.de", name: "X" } })).status, 403);
    const a = g.client(); await g.login(a, "a@b.de");
    assert.equal((await a("/admin")).status, 200);
  } finally { await g.stop(); }
});

test("Einladen zeigt Link, Doppelte und ungueltige Adressen werden abgewiesen", async () => {
  const g = await start();
  try {
    await g.addUser("a@b.de", { admin: true });
    const a = g.client(); await g.login(a, "a@b.de");
    const r = await a("/admin/users", { form: { email: "Neu@B.de", name: "Neu" } });
    assert.match(await r.text(), /set-password\?token=/);
    assert.ok(g.users.byEmail("neu@b.de"));
    assert.equal((await a("/admin/users", { form: { email: "neu@b.de", name: "N" } })).status, 409);
    assert.equal((await a("/admin/users", { form: { email: "kaputt", name: "N" } })).status, 400);
  } finally { await g.stop(); }
});

test("Admin kann sich nicht selbst sperren, loeschen oder entrechten", async () => {
  const g = await start();
  try {
    const me = await g.addUser("a@b.de", { admin: true });
    const a = g.client(); await g.login(a, "a@b.de");
    for (const act of ["disable", "delete", "admin"]) assert.equal((await a(`/admin/users/${me.id}/${act}`, { form: {} })).status, 400, act);
    assert.equal(g.users.byId(me.id).isAdmin, 1);
  } finally { await g.stop(); }
});

test("Sperren und Loeschen wirken", async () => {
  const g = await start();
  try {
    await g.addUser("a@b.de", { admin: true });
    const v = await g.addUser("v@b.de");
    const a = g.client(); await g.login(a, "a@b.de");
    await a(`/admin/users/${v.id}/disable`, { form: {} });
    assert.equal(g.users.byId(v.id).disabled, 1);
    await a(`/admin/users/${v.id}/delete`, { form: {} });
    assert.equal(g.users.byId(v.id), null);
  } finally { await g.stop(); }
});

test("Ausgaben werden maskiert", async () => {
  const g = await start();
  try {
    await g.addUser("a@b.de", { admin: true });
    g.users.create({ email: "x@b.de", name: "<script>alert(1)</script>" });
    const a = g.client(); await g.login(a, "a@b.de");
    assert.doesNotMatch(await (await a("/admin")).text(), /<script>alert/);
  } finally { await g.stop(); }
});
