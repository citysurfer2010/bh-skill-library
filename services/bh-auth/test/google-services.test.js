import test from "node:test";
import assert from "node:assert/strict";
import { servicesStatus, storeServices } from "../lib/google-services.js";
import { profileView } from "../lib/views-profile.js";

const cfg = (fetchImpl) => ({ google: { clientId: "c", clientSecret: "s" }, connect: { url: "http://gw", secret: "x" }, fetch: fetchImpl });
const user = { email: "Anna@beispiel.de", name: "Anna" };

test("Google-Dienste: Gateway-User kommt aus der E-Mail, Geheimnis wird mitgeschickt", async () => {
  let seen;
  const ok = await storeServices(cfg(async (u, o) => { seen = [u, o]; return { ok: true }; }), user, { access_token: "a", refresh_token: "r", expires_in: 5 });
  assert.equal(ok, true); assert.equal(seen[0], "http://gw/connect/google");
  assert.equal(seen[1].headers["x-connect-secret"], "x"); assert.equal(JSON.parse(seen[1].body).user, "anna");
});

test("Google-Dienste: Status, Ausfall und fehlende Einrichtung", async () => {
  assert.deepEqual(await servicesStatus(cfg(async () => ({ ok: true, json: async () => ({ connected: true, email: "a@b.de" }) })), user), { connected: true, email: "a@b.de" });
  assert.equal(await servicesStatus(cfg(async () => { throw new Error("weg"); }), user), null);
  assert.equal(await servicesStatus({ ...cfg(async () => ({})), connect: { url: "", secret: "" } }, user), null);
});

test("Profil: Karte nur, wenn der Status bekannt ist", () => {
  const base = { user: { ...user, id: 1 }, min: 8 };
  assert.doesNotMatch(profileView({ ...base, googleServices: null }), /Verbundene Dienste/);
  assert.match(profileView({ ...base, googleServices: { connected: false } }), /oauth\/google\/services/);
  const on = profileView({ ...base, googleServices: { connected: true, email: "a@b.de" } });
  assert.match(on, /Neu verbinden/); assert.match(on, /Verbunden als a@b.de/); assert.match(on, /services\/disconnect/);
});
