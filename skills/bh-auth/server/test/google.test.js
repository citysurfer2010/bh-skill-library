import test from "node:test";
import assert from "node:assert/strict";
import { start } from "./helpers.js";

const googleWith = (info) => async (url) => (String(url).includes("/token")
  ? { ok: true, json: async () => ({ access_token: "t" }) }
  : { ok: true, json: async () => info });

async function flow(g, c) {
  const r = await c("/oauth/google?next=/admin");
  const u = new URL(r.headers.get("location"));
  return { u, cb: (state = u.searchParams.get("state")) => c(`/oauth/google/callback?state=${state}&code=c`) };
}

test("Link zu Google: kein hd-Filter, mit state und PKCE, private Konten moeglich", async () => {
  const g = await start({ google: true });
  try {
    const { u } = await flow(g, g.client());
    assert.equal(u.searchParams.has("hd"), false);
    assert.ok(u.searchParams.get("state"));
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  } finally { await g.stop(); }
});

test("Eingeladene private Adresse kommt herein und wird ans Konto gebunden", async () => {
  const g = await start({ google: true, fetchImpl: googleWith({ sub: "s1", email: "ich@gmail.com", email_verified: true }) });
  try {
    const u = await g.addUser("ich@gmail.com", { password: false });
    const c = g.client();
    const r = await (await flow(g, c)).cb();
    assert.equal(r.headers.get("location"), "/admin");
    assert.equal((await c("/validate")).status, 200);
    assert.equal(g.users.byId(u.id).googleSub, "s1");
  } finally { await g.stop(); }
});

test("Nicht eingeladenes Google-Konto bekommt keinen Zugang und keinen Eintrag", async () => {
  const g = await start({ google: true, fetchImpl: googleWith({ sub: "s9", email: "fremd@gmail.com", email_verified: true }) });
  try {
    const c = g.client();
    const r = await (await flow(g, c)).cb();
    assert.match(r.headers.get("location"), /no-access/);
    assert.equal(g.users.byEmail("fremd@gmail.com"), null);
    assert.equal((await c("/validate")).status, 401);
  } finally { await g.stop(); }
});

test("Falscher state wird abgewiesen", async () => {
  const g = await start({ google: true, fetchImpl: () => assert.fail("kein Aufruf erwartet") });
  try { assert.match((await (await flow(g, g.client())).cb("falsch")).headers.get("location"), /error/); }
  finally { await g.stop(); }
});

test("Unbestaetigte E-Mail und fremdes Konto zur selben Adresse werden abgewiesen", async () => {
  const unverified = await start({ google: true, fetchImpl: googleWith({ sub: "s1", email: "a@gmail.com", email_verified: false }) });
  try {
    await unverified.addUser("a@gmail.com", { password: false });
    assert.match((await (await flow(unverified, unverified.client())).cb()).headers.get("location"), /no-access/);
  } finally { await unverified.stop(); }
  const other = await start({ google: true, fetchImpl: googleWith({ sub: "anders", email: "a@gmail.com", email_verified: true }) });
  try {
    const u = await other.addUser("a@gmail.com", { password: false });
    other.users.bindGoogle(u.id, "s1");
    assert.match((await (await flow(other, other.client())).cb()).headers.get("location"), /no-access/);
  } finally { await other.stop(); }
});

const via = (...infos) => { let i = 0; return async (url) => (String(url).includes("/token") ? { ok: true, json: async () => ({ access_token: "t" }) } : { ok: true, json: async () => infos[Math.min(i++, infos.length - 1)] }); };
const privat = { sub: "g1", email: "privat@gmail.com", email_verified: true };

async function link(c) {
  const r = await c("/oauth/google/link");
  const state = new URL(r.headers.get("location")).searchParams.get("state");
  return c(`/oauth/google/callback?state=${state}&code=c`);
}

test("Verknuepfen: Google-Konto mit anderer Adresse meldet danach genau diesen User an", async () => {
  const g = await start({ google: true, fetchImpl: via(privat) });
  try {
    const u = await g.addUser("matti@firma.de");
    const c = g.client(); await g.login(c, "matti@firma.de");
    assert.equal((await link(c)).headers.get("location"), "/profile?saved=1");
    assert.equal(g.users.byId(u.id).googleSub, "g1");
    const neu = g.client();
    await (await flow(g, neu)).cb();
    assert.equal((await (await neu("/validate")).json()).email, "matti@firma.de");
    assert.equal(g.users.byEmail("privat@gmail.com"), null);
  } finally { await g.stop(); }
});

test("Verknuepfen nur angemeldet, ein Google-Konto gehoert genau einem User", async () => {
  const g = await start({ google: true, fetchImpl: via(privat) });
  try {
    assert.equal((await g.client()("/oauth/google/link")).headers.get("location").startsWith("/login"), true);
    const a = await g.addUser("a@b.de"); await g.addUser("b@b.de");
    g.users.bindGoogle(a.id, "g1");
    const c = g.client(); await g.login(c, "b@b.de");
    assert.equal((await link(c)).headers.get("location"), "/profile?google=taken");
    assert.equal(g.users.byEmail("b@b.de").googleSub, null);
  } finally { await g.stop(); }
});

test("Verknuepfung bricht ab, wenn die Sitzung inzwischen weg ist", async () => {
  const g = await start({ google: true, fetchImpl: via(privat) });
  try {
    const u = await g.addUser("a@b.de");
    const c = g.client(); await g.login(c, "a@b.de");
    const r = await c("/oauth/google/link");
    const state = new URL(r.headers.get("location")).searchParams.get("state");
    await c("/logout", { form: {} });
    assert.match((await c(`/oauth/google/callback?state=${state}&code=c`)).headers.get("location"), /error/);
    assert.equal(g.users.byId(u.id).googleSub, null);
  } finally { await g.stop(); }
});

test("Trennen braucht ein Passwort, sonst waere das Konto ausgesperrt", async () => {
  const g = await start({ google: true, fetchImpl: via(privat) });
  try {
    const u = await g.addUser("a@b.de");
    const c = g.client(); await g.login(c, "a@b.de");
    await link(c);
    assert.equal((await c("/profile/google/unlink", { form: {} })).status, 302);
    assert.equal(g.users.byId(u.id).googleSub, null);
    await link(c);
    assert.match(await (await c("/profile")).text(), /Trennen/);
  } finally { await g.stop(); }
});

test("Profil bietet Verknuepfung nur an, wenn Google eingerichtet ist", async () => {
  const on = await start({ google: true, fetchImpl: via(privat) });
  try { await on.addUser("a@b.de"); const c = on.client(); await on.login(c, "a@b.de"); assert.match(await (await c("/profile")).text(), /oauth\/google\/link/); } finally { await on.stop(); }
  const off = await start();
  try { await off.addUser("a@b.de"); const c = off.client(); await off.login(c, "a@b.de"); assert.doesNotMatch(await (await c("/profile")).text(), /oauth\/google\/link/); } finally { await off.stop(); }
});
