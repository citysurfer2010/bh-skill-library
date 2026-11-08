import test from "node:test";
import assert from "node:assert/strict";
import { start, PW } from "./helpers.js";
import { safeNext } from "../lib/session.js";

test("Login-Seite ist blau gebrandet und nennt kein Google ohne Client", async () => {
  const g = await start();
  try {
    const html = await (await g.client()("/login")).text();
    assert.match(html, /BH Platform/);
    assert.doesNotMatch(html, /Mit Google/);
  } finally { await g.stop(); }
});

test("Passwort-Login, Sitzung, Logout", async () => {
  const g = await start();
  try {
    await g.addUser("a@b.de");
    const c = g.client();
    assert.equal((await g.login(c, "a@b.de")).status, 302);
    assert.equal((await c("/validate")).status, 200);
    assert.equal((await c("/auth-headers")).headers.get("x-auth-email"), "a@b.de");
    await c("/logout", { form: {} });
    assert.equal((await c("/validate")).status, 401);
  } finally { await g.stop(); }
});

test("Falsches Passwort und Sperre nach Fehlversuchen", async () => {
  const g = await start();
  try {
    await g.addUser("a@b.de");
    const c = g.client();
    for (let i = 0; i < 3; i++) assert.equal((await c("/login", { form: { email: "a@b.de", password: "falsch-falsch-falsch" } })).status, 401);
    assert.equal((await c("/login", { form: { email: "a@b.de", password: PW } })).status, 429);
  } finally { await g.stop(); }
});

test("Gesperrter User: Sitzung endet sofort, kein neuer Login", async () => {
  const g = await start();
  try {
    const u = await g.addUser("a@b.de");
    const c = g.client();
    await g.login(c, "a@b.de");
    g.users.setDisabled(u.id, true);
    assert.equal((await c("/validate")).status, 401);
    assert.equal((await g.login(g.client(), "a@b.de")).status, 401);
  } finally { await g.stop(); }
});

test("Weiterleitung nur auf eigene Pfade", () => {
  for (const bad of ["https://evil.de", "//evil.de", "/\\evil.de", "", "javascript:x", "/a\r\nX: y"]) assert.equal(safeNext(bad), "/", bad);
  assert.equal(safeNext("/admin?x=1"), "/admin?x=1");
});

test("Einladungslink: gilt einmal, Passwortregeln greifen", async () => {
  const g = await start();
  try {
    const u = await g.addUser("n@b.de", { password: false });
    const token = g.users.issueLink(u.id, "invite");
    const c = g.client();
    assert.equal((await c(`/set-password?token=${token}`)).status, 200);
    assert.equal((await c("/set-password", { form: { token, password: "kurz", confirm: "kurz" } })).status, 400);
    assert.equal((await c("/set-password", { form: { token, password: PW, confirm: PW } })).status, 200);
    assert.equal((await c(`/set-password?token=${token}`)).status, 400);
    assert.equal((await g.login(c, "n@b.de")).status, 302);
  } finally { await g.stop(); }
});

test("Link wird nur als Hash gespeichert", async () => {
  const g = await start();
  try {
    const u = await g.addUser("n@b.de");
    const token = g.users.issueLink(u.id, "reset");
    assert.notEqual(g.users.byId(u.id).resetTokenHash, token);
  } finally { await g.stop(); }
});

test("Passwort aendern beendet alte Sitzungen anderer Geraete", async () => {
  const g = await start();
  try {
    const u = await g.addUser("a@b.de");
    const other = g.client();
    await g.login(other, "a@b.de");
    await new Promise((r) => setTimeout(r, 1100));
    await g.users.setPassword(u.id, "ein-neues-langes-passwort");
    assert.equal((await other("/validate")).status, 401);
  } finally { await g.stop(); }
});

test("Fremde Herkunft bei POST wird abgewiesen", async () => {
  const g = await start();
  try { assert.equal((await g.client()("/login", { form: { email: "x" }, headers: { origin: "https://evil.de" } })).status, 403); }
  finally { await g.stop(); }
});
