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
