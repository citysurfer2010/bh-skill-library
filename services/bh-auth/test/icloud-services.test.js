import test from "node:test";
import assert from "node:assert/strict";
import { storeIcloud, removeIcloud, icloudStatus } from "../lib/icloud-services.js";
import { profileView } from "../lib/views-profile.js";

const cfg = (fetchImpl) => ({ connect: { url: "http://gw", secret: "x" }, fetch: fetchImpl });
const user = { email: "Anna@beispiel.de", name: "Anna", id: 1 };
const FORM = { appleId: " a@b.de ", password: " ABCD-efgh-ijkl-mnop ", mailUser: "" };

test("connect: gateway user from the email, secret sent, spaces and case normalized", async () => {
  let seen;
  assert.deepEqual(await storeIcloud(cfg(async (u, o) => { seen = [u, o]; return { ok: true }; }), user, FORM), { ok: true });
  assert.equal(seen[0], "http://gw/connect/icloud"); assert.equal(seen[1].headers["x-connect-secret"], "x");
  assert.deepEqual(JSON.parse(seen[1].body), { user: "anna", appleId: "a@b.de", password: "abcd-efgh-ijkl-mnop", mailUser: "" });
});

test("connect: a password pasted without dashes is normalized", async () => {
  let body;
  await storeIcloud(cfg(async (_u, o) => { body = JSON.parse(o.body); return { ok: true }; }), user, { appleId: "a@b.de", password: "abcd efgh ijkl MNOP" });
  assert.equal(body.password, "abcd-efgh-ijkl-mnop");
});

test("connect: gateway message is passed on, outage gives a plain message", async () => {
  assert.equal((await storeIcloud(cfg(async () => ({ ok: false, json: async () => ({ error: "iCloud lehnt ab" }) })), user, FORM)).error, "iCloud lehnt ab");
  const down = await storeIcloud(cfg(async () => { throw new Error("internal detail"); }), user, FORM);
  assert.equal(down.ok, false); assert.doesNotMatch(down.error, /internal detail/);
});

test("status and removal survive an outage", async () => {
  assert.equal(await icloudStatus(cfg(async () => { throw new Error("weg"); }), user), null);
  assert.equal(await removeIcloud(cfg(async () => { throw new Error("weg"); }), user), false);
  assert.equal(await icloudStatus({ connect: { url: "", secret: "" } }, user), null);
});

const base = { user, min: 8, googleServices: null };

test("profile: card appears for iCloud alone, form closed by default", () => {
  assert.doesNotMatch(profileView({ ...base, icloud: null }), /iCloud/);
  const html = profileView({ ...base, icloud: { connected: false } });
  assert.match(html, /Verbundene Dienste/); assert.match(html, /id="icloudForm"[^>]* hidden/); assert.match(html, /app-spezifisches Passwort/);
});

test("profile: connected and rejected states", () => {
  const on = profileView({ ...base, icloud: { connected: true, appleId: "a@b.de" } });
  assert.match(on, /Verbunden als a@b.de/); assert.match(on, /icloud\/disconnect/); assert.match(on, /Neu verbinden/);
  assert.match(profileView({ ...base, icloud: { connected: true, appleId: "a@b.de", rejected: true } }), /Anmeldung abgelehnt/);
});

test("profile: without iCloud mail the connection stays calm and only offers the address", () => {
  const html = profileView({ ...base, icloud: { connected: true, appleId: "a@b.de", mailRejected: true } });
  assert.match(html, /E-Mail ist nicht eingerichtet/); assert.doesNotMatch(html, /Anmeldung abgelehnt/);
  assert.doesNotMatch(html, /p-tag warn/); assert.match(html, /Adresse ergänzen/);
  assert.match(html, /name="mailUser"[^>]* required data-autofocus/);
  assert.doesNotMatch(html, /id="icloudPassword"/); assert.match(html, /type="hidden" name="appleId" value="a@b.de"/);
});

test("profile: an error reopens the form, escapes input and never echoes a password", () => {
  const html = profileView({ ...base, icloud: { connected: false }, icloudError: "<b>nein</b>", icloudForm: { appleId: "\"><x", mailUser: "" } });
  assert.doesNotMatch(html, /id="icloudForm"[^>]* hidden/); assert.doesNotMatch(html, /<b>nein/); assert.doesNotMatch(html, /"><x/);
  assert.doesNotMatch(html, /name="password"[^>]*value=/);
});
