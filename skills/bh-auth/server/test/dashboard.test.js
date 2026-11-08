import test from "node:test";
import assert from "node:assert/strict";
import { start } from "./helpers.js";
import { validAppUrl } from "../lib/apps.js";

async function logged(g, email, opts) { await g.addUser(email, opts); const c = g.client(); await g.login(c, email); return c; }

test("Rollen: Uebersicht und Profil fuer Angemeldete, Verwaltung nur fuer Admins", async () => {
  const g = await start();
  try {
    const anon = g.client();
    for (const p of ["/", "/profile", "/admin/apps"]) assert.equal((await anon(p)).status, 302, p);
    const u = await logged(g, "u@b.de");
    assert.equal((await u("/")).status, 200);
    assert.equal((await u("/profile")).status, 200);
    assert.equal((await u("/admin/apps")).status, 403);
    assert.equal((await u("/admin/apps", { form: { name: "X", url: "https://x.de" } })).status, 403);
    assert.equal((await u("/admin/apps/1/delete", { form: {} })).status, 403);
    assert.equal((await (await logged(g, "a@b.de", { admin: true }))("/admin/apps")).status, 200);
  } finally { await g.stop(); }
});

test("Uebersicht zeigt Admin-Apps nur Admins", async () => {
  const g = await start();
  try {
    const a = await logged(g, "a@b.de", { admin: true });
    await a("/admin/apps", { form: { name: "Fuer alle", url: "https://a.de" } });
    await a("/admin/apps", { form: { name: "Geheim", url: "https://b.de", adminOnly: "1" } });
    const admin = await (await a("/")).text();
    assert.match(admin, /Fuer alle/); assert.match(admin, /Geheim/); assert.match(admin, /Benutzerverwaltung/);
    const user = await (await (await logged(g, "u@b.de"))("/")).text();
    assert.match(user, /Fuer alle/); assert.doesNotMatch(user, /Geheim/); assert.doesNotMatch(user, /Benutzerverwaltung/);
  } finally { await g.stop(); }
});

test("App-Adressen: nur https oder eigene Pfade", () => {
  assert.equal(validAppUrl("https://a.de/x"), "https://a.de/x");
  assert.equal(validAppUrl("/admin"), "/admin");
  for (const bad of ["javascript:alert(1)", "http://a.de", "//evil.de", "", 'https://a.de/"onclick=x', "data:text/html,x"]) assert.equal(validAppUrl(bad), null, bad);
});

test("App anlegen mit ungueltiger Adresse wird abgewiesen, Loeschen wirkt", async () => {
  const g = await start();
  try {
    const a = await logged(g, "a@b.de", { admin: true });
    assert.equal((await a("/admin/apps", { form: { name: "X", url: "javascript:alert(1)" } })).status, 400);
    await a("/admin/apps", { form: { name: "Weg", url: "https://w.de" } });
    const id = /admin\/apps\/([\w-]+)\/delete/.exec(await (await a("/admin/apps")).text())[1];
    await a(`/admin/apps/${id}/delete`, { form: {} });
    assert.doesNotMatch(await (await a("/")).text(), /Weg/);
  } finally { await g.stop(); }
});

test("Profil: Name aendern, Eingaben maskiert, leerer Name abgewiesen", async () => {
  const g = await start();
  try {
    const u = await logged(g, "u@b.de");
    assert.equal((await u("/profile", { form: { name: "" } })).status, 400);
    assert.equal((await u("/profile", { form: { name: "<b>Neu</b>" } })).status, 302);
    const page = await (await u("/profile")).text();
    assert.match(page, /&lt;b&gt;Neu/); assert.doesNotMatch(page, /<b>Neu/);
    assert.equal(g.users.byEmail("u@b.de").name, "<b>Neu</b>");
  } finally { await g.stop(); }
});

test("Auf anderen Geraeten abmelden: diese Sitzung bleibt, andere enden", async () => {
  const g = await start();
  try {
    await g.addUser("u@b.de");
    const here = g.client(); const other = g.client();
    await g.login(other, "u@b.de");
    await new Promise((r) => setTimeout(r, 1100));
    await g.login(here, "u@b.de");
    await new Promise((r) => setTimeout(r, 1100));
    await here("/profile/sessions", { form: {} });
    assert.equal((await here("/validate")).status, 200);
    assert.equal((await other("/validate")).status, 401);
  } finally { await g.stop(); }
});

test("Navbar: Benutzermenue mit Profil, Abmelden und Design auf jeder angemeldeten Seite", async () => {
  const g = await start();
  try {
    const u = await logged(g, "u@b.de");
    for (const p of ["/", "/profile"]) {
      const html = await (await u(p)).text();
      assert.match(html, /class="bhs-navbar"/, p);
      for (const needle of ['class="bh-um-btn"', 'href="/profile"', 'action="/logout"', 'data-um-theme="dark"']) assert.ok(html.includes(needle), `${p}: ${needle}`);
      assert.doesNotMatch(html, /href="\/admin"/, p);
    }
    const admin = await (await (await logged(g, "a@b.de", { admin: true }))("/")).text();
    assert.match(admin, /href="\/admin"/);
  } finally { await g.stop(); }
});

test("Uebersicht: Suchfeld, Suchdaten nur mit erlaubten Apps, Script-Block sicher maskiert", async () => {
  const g = await start();
  try {
    const a = await logged(g, "a@b.de", { admin: true });
    await a("/admin/apps", { form: { name: "</script><b>x", url: "https://a.de" } });
    await a("/admin/apps", { form: { name: "Nur Admin", url: "https://b.de", adminOnly: "1" } });
    const adminHtml = await (await a("/")).text();
    assert.match(adminHtml, /id="appSearch"/);
    assert.doesNotMatch(adminHtml, /"label":"<\/script>/);
    const data = (html) => JSON.parse(/id="dashData">(.*?)<\/script>/s.exec(html)[1]);
    assert.ok(data(adminHtml).apps.some((x) => x.label === "Nur Admin"));
    const userHtml = await (await (await logged(g, "u@b.de"))("/")).text();
    const labels = data(userHtml).apps.map((x) => x.label);
    assert.ok(!labels.includes("Nur Admin") && !labels.includes("Benutzerverwaltung"));
    assert.ok(labels.includes("</script><b>x"));
  } finally { await g.stop(); }
});

test("Suche: Umlaute in beiden Schreibweisen, App schlaegt schwaecheren Treffer", async () => {
  globalThis.window = {};
  await import("../public/dashboard-modules.js");
  const S = globalThis.window.BHModuleSearch;
  const apps = [{ id: "m", label: "Müllabfuhr", url: "https://m.de" }, { id: "f", label: "Finanzen", url: "https://f.de" }];
  assert.equal(S.rank([], apps, "mull", 6).top.id, "m");
  assert.equal(S.rank([], apps, "muell", 6).top.id, "m");
  assert.equal(S.rank([], apps, "fin", 6).top.url, "https://f.de");
  assert.equal(S.rank([], apps, "f", 6).top, null);
  assert.equal(S.rank([], apps, "xyz", 6).top, null);
  const html = S.html({ modules: [{ id: "x", label: "<b>", url: "javascript:alert(1)", appLabel: "A" }], top: null });
  assert.doesNotMatch(html, /<b>|javascript:/);
});

