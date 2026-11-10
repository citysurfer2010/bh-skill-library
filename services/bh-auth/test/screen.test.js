import test from "node:test";
import assert from "node:assert/strict";
import { start } from "./helpers.js";

const post = (g, token, body) => fetch(`${g.base}/screen-update`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test("Anzeige: nur mit geheimem Link lesbar, nur mit Schreib-Schluessel aenderbar", async () => {
  const g = await start();
  try {
    assert.equal((await post(g, null, { title: "x" })).status, 401);
    assert.equal((await post(g, "lesen", { title: "x" })).status, 401);
    assert.equal((await post(g, "schreiben", { title: "Hallo", text: "Welt" })).status, 200);
    assert.notEqual((await fetch(`${g.base}/screen/falsch`, { redirect: "manual" })).status, 200);
    assert.notEqual((await fetch(`${g.base}/screen/schreiben`, { redirect: "manual" })).status, 200);
    const html = await (await fetch(`${g.base}/screen/lesen`)).text();
    assert.match(html, /Hallo/); assert.match(html, /Welt/);
    assert.deepEqual(await (await fetch(`${g.base}/screen/lesen/content`)).json(), { mode: "text", title: "Hallo", text: "Welt", url: null, offer: null, session: null, answer: null, video: null, station: "" });
  } finally { await g.stop(); }
});

test("Anzeige: Inhalt wird maskiert und gekuerzt", async () => {
  const g = await start();
  try {
    await post(g, "schreiben", { title: "<script>x</script>" + "a".repeat(500) });
    const html = await (await fetch(`${g.base}/screen/lesen`)).text();
    assert.doesNotMatch(html, /<script>x/);
    assert.equal((await (await fetch(`${g.base}/screen/lesen/content`)).json()).title.length, 200);
  } finally { await g.stop(); }
});

test("Anzeige als Bild: echtes JPEG, nur mit geheimem Link, Sonderzeichen sicher", async () => {
  const { screenSvg, wrap } = await import("../lib/screen-image.js");
  const g = await start();
  try {
    await post(g, "schreiben", { title: "Hallo", text: "Größe & Maß" });
    const r = await fetch(`${g.base}/screen/lesen/image.jpg`);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    const b = new Uint8Array(await r.arrayBuffer());
    assert.deepEqual([b[0], b[1], b[2]], [0xff, 0xd8, 0xff]);
    assert.notEqual((await fetch(`${g.base}/screen/falsch/image.jpg`, { redirect: "manual" })).status, 200);
  } finally { await g.stop(); }
  assert.doesNotMatch(screenSvg({ title: "<b>&", text: "" }), /<b>&/);
  assert.deepEqual(wrap("ein sehr langer satz mit vielen worten", 10, 2), ["ein sehr", "langer"]);
});

test("Anzeige: Webseiten-Modus nur mit https", async () => {
  const g = await start();
  try {
    assert.equal((await post(g, "schreiben", { mode: "url", url: "javascript:alert(1)" })).status, 400);
    assert.equal((await post(g, "schreiben", { mode: "url", url: "http://a.de" })).status, 400);
    const r = await post(g, "schreiben", { mode: "url", url: "https://de.wikipedia.org/" });
    assert.equal(r.status, 200); assert.equal((await r.json()).previous, "text");
    assert.equal((await post(g, "schreiben", { mode: "audio", url: "http://radio.de/x.mp3" })).status, 400);
    const a = await post(g, "schreiben", { mode: "audio", url: "https://radio.de/x.mp3", title: "Radio" });
    assert.equal(a.status, 200); assert.equal((await a.json()).previous, "url");
    const audio = await (await fetch(`${g.base}/screen/lesen/content`)).json();
    assert.equal(audio.mode, "audio"); assert.equal(audio.url, "https://radio.de/x.mp3"); assert.equal(audio.title, "Radio");
    assert.equal((await post(g, "schreiben", { mode: "url", url: "https://de.wikipedia.org/" })).status, 200);
    const c = await (await fetch(`${g.base}/screen/lesen/content`)).json();
    assert.equal(c.mode, "url"); assert.equal(c.url, "https://de.wikipedia.org/");
  } finally { await g.stop(); }
});


test("Freigabe: Angebot, Antwort nur zur laufenden Sitzung und nur mit den richtigen Schluesseln", async () => {
  const g = await start();
  const answer = (token, body) => fetch(`${g.base}/screen/${token}/answer`, { method: "POST", headers: { "content-type": "text/plain", origin: "file://" }, body: JSON.stringify(body) });
  const read = (token, s) => fetch(`${g.base}/screen-answer?session=${s}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  try {
    assert.equal((await post(g, "schreiben", { mode: "share", offer: "kaputt" })).status, 400);
    const { session } = await (await post(g, "schreiben", { mode: "share", offer: "v=0 angebot" })).json();
    assert.match(session, /^[0-9a-f]{18}$/);
    const c = await (await fetch(`${g.base}/screen/lesen/content`)).json();
    assert.equal(c.mode, "share"); assert.equal(c.offer, "v=0 angebot"); assert.equal(c.session, session);
    assert.equal((await read(null, session)).status, 401);
    assert.equal((await read("lesen", session)).status, 401);
    assert.equal((await (await read("schreiben", session)).json()).answer, null);
    assert.notEqual((await answer("falsch", { session, sdp: "v=0 a" })).status, 204);
    assert.equal((await answer("lesen", { session: "alt", sdp: "v=0 a" })).status, 409);
    assert.equal((await answer("lesen", { session, sdp: "kein sdp" })).status, 409);
    assert.equal((await answer("lesen", { session, sdp: "v=0 antwort" })).status, 204);
    assert.equal((await (await read("schreiben", session)).json()).answer, "v=0 antwort");
    assert.equal((await (await read("schreiben", "andere")).json()).answer, null);
    await post(g, "schreiben", { title: "x" });
    assert.equal((await answer("lesen", { session, sdp: "v=0 spaet" })).status, 409);
  } finally { await g.stop(); }
});

test("Anzeige: Beamer wartet auf Aenderungen und bekommt sie sofort", async () => {
  const g = await start();
  const content = (since) => fetch(`${g.base}/screen/lesen/content?since=${since}`).then((r) => r.json());
  try {
    const { v } = await content("");
    assert.ok(v);
    const t0 = Date.now(); const waiting = content(v);
    await new Promise((r) => setTimeout(r, 100));
    await post(g, "schreiben", { title: "Neu" });
    const c = await waiting;
    assert.equal(c.title, "Neu"); assert.notEqual(c.v, v); assert.ok(Date.now() - t0 < 2000);
    assert.equal((await fetch(`${g.base}/screen/falsch/content?since=1`, { redirect: "manual" })).status === 200, false);
  } finally { await g.stop(); }
});

test("Menue: nur mit Schreib-Schluessel, Auswahl des Beamers wird einmal abgeholt", async () => {
  const g = await start();
  const write = (path, token, body) => fetch(`${g.base}${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const ask = (token, body) => fetch(`${g.base}/screen/${token}/request`, { method: "POST", headers: { "content-type": "text/plain", origin: "file://" }, body: JSON.stringify(body) });
  const take = (token) => fetch(`${g.base}/screen-requests`, { headers: { authorization: `Bearer ${token}` } });
  try {
    assert.equal((await write("/screen-menu", "lesen", { radio: [], mood: [] })).status, 401);
    assert.equal((await write("/screen-menu", "schreiben", { radio: 1 })).status, 400);
    assert.equal((await write("/screen-menu", "schreiben", { radio: [{ id: "a" }], mood: [] })).status, 204);
    assert.equal((await (await fetch(`${g.base}/screen/lesen/content?since=`)).json()).menu.radio[0].id, "a");
    assert.equal((await ask("falsch", { kind: "radio", id: "a" })).status === 204, false);
    assert.equal((await ask("lesen", { kind: "boese", id: "a" })).status, 400);
    assert.equal((await ask("lesen", { kind: "radio", id: "../x" })).status, 400);
    assert.equal((await ask("lesen", { kind: "radio", id: "ndr2" })).status, 204);
    assert.equal((await take("lesen")).status, 401);
    assert.deepEqual((await (await take("schreiben")).json()).requests, [{ kind: "radio", id: "ndr2" }]);
    assert.deepEqual((await (await take("schreiben")).json()).requests, []);
  } finally { await g.stop(); }
});

test("Video: Kennung wird geprueft, Player-Seite nur mit geheimem Link und ohne Rahmen-Sperre", async () => {
  const g = await start();
  try {
    assert.equal((await post(g, "schreiben", { mode: "video", video: "kurz" })).status, 400);
    assert.equal((await post(g, "schreiben", { mode: "video", video: "6VB4bgiB0yA", url: "http://a.de/x.mp3" })).status, 400);
    assert.equal((await post(g, "schreiben", { mode: "video", video: "6VB4bgiB0yA", url: "https://a.de/x.mp3", station: "NDR 2" })).status, 200);
    const c = await (await fetch(`${g.base}/screen/lesen/content`)).json();
    assert.equal(c.video, "6VB4bgiB0yA"); assert.equal(c.url, "https://a.de/x.mp3"); assert.equal(c.station, "NDR 2");
    const p = await fetch(`${g.base}/screen/lesen/player?v=6VB4bgiB0yA`);
    assert.equal(p.status, 200); assert.equal(p.headers.get("x-frame-options"), null);
    assert.match(await p.text(), /youtube-nocookie\.com\/embed\/6VB4bgiB0yA/);
    assert.notEqual((await fetch(`${g.base}/screen/falsch/player?v=6VB4bgiB0yA`, { redirect: "manual" })).status, 200);
    assert.notEqual((await fetch(`${g.base}/screen/lesen/player?v=%22%3E%3Cb`, { redirect: "manual" })).status, 200);
  } finally { await g.stop(); }
});

test("Menue: Die App wartet auf eine Auswahl und bekommt sie sofort", async () => {
  const g = await start();
  try {
    const t0 = Date.now();
    const waiting = fetch(`${g.base}/screen-requests?wait=20`, { headers: { authorization: "Bearer schreiben" } }).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 100));
    await fetch(`${g.base}/screen/lesen/request`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ kind: "radio", id: "ndr2" }) });
    assert.deepEqual((await waiting).requests, [{ kind: "radio", id: "ndr2" }]);
    assert.ok(Date.now() - t0 < 2000);
  } finally { await g.stop(); }
});

test("Fotos: nur mit Schluessel einlieferbar, nur mit Link lesbar, nicht auf Vorrat", async () => {
  const sharp = (await import("sharp")).default;
  const g = await start();
  try {
    const data = (await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#123456" } }).jpeg().toBuffer()).toString("base64");
    const push = (token, body) => fetch(`${g.base}/screen-photo`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await push(null, { data })).status, 401);
    assert.equal((await push("lesen", { data })).status, 401);
    assert.equal((await push("schreiben", { data: "kaputt" })).status, 422);
    assert.equal((await push("schreiben", { data, caption: "Urlaub" })).status, 204);
    assert.notEqual((await fetch(`${g.base}/screen/falsch/photo-wait`, { redirect: "manual" })).status, 200);
    const p = await (await fetch(`${g.base}/screen/lesen/photo-wait`)).json();
    assert.equal(p.caption, "Urlaub");
    assert.notEqual((await fetch(`${g.base}/screen/falsch/photo/${p.id}`, { redirect: "manual" })).status, 200);
    const img = await fetch(`${g.base}/screen/lesen/photo/${p.id}`);
    assert.equal(img.headers.get("cache-control"), "no-store");
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    assert.equal(meta.width, 1620); assert.equal(meta.height, 1080);
    assert.equal((await fetch(`${g.base}/screen/lesen/photo/gibtsnicht`)).status, 404);
    await fetch(`${g.base}/screen/lesen/request`, { method: "POST", body: JSON.stringify({ kind: "photos", id: "all" }) });
    assert.equal((await fetch(`${g.base}/screen/lesen/photo/${p.id}`)).status, 404);
    await push("schreiben", { done: true, empty: false });
    assert.equal((await (await fetch(`${g.base}/screen/lesen/photo-wait`)).json()).done, true);
  } finally { await g.stop(); }
});

test("iCloud-Fotos: Anmeldeseite nur fuer den Besitzer, Formular kommt an, Pfade passen", async () => {
  const http = await import("node:http");
  const { rewriteHtml } = await import("../routes/icloud-photos-login.js");
  const seen = [];
  const upstream = http.createServer((req, res) => { let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => { seen.push({ m: req.method, u: req.url, b }); res.setHeader("content-type", "text/html"); res.end('<a hx-get="/status">x</a>'); }); }).listen(0, "127.0.0.1");
  await new Promise((r) => upstream.once("listening", r));
  process.env.BH_ICLOUD_LOGIN_HOST = "127.0.0.1"; process.env.BH_ICLOUD_LOGIN_PORT = String(upstream.address().port); process.env.BH_ICLOUD_PHOTOS_OWNER = "Chef@Beispiel.de";
  const g = await start();
  try {
    assert.equal((await g.client()("/profile/icloud-photos/")).status, 302);
    await g.addUser("u@beispiel.de"); await g.addUser("chef@beispiel.de");
    const other = g.client(); await g.login(other, "u@beispiel.de");
    assert.equal((await other("/profile/icloud-photos/")).status, 403);
    const chef = g.client(); await g.login(chef, "chef@beispiel.de");
    const page = await chef("/profile/icloud-photos/");
    assert.equal(page.status, 200); assert.match(await page.text(), /hx-get="\/profile\/icloud-photos\/status"/);
    assert.match(page.headers.get("content-security-policy"), /unsafe-inline/);
    await chef("/profile/icloud-photos/password", { form: { password: "x y" } });
    assert.deepEqual(seen.at(-1), { m: "POST", u: "/password", b: "password=x+y" });
    assert.match(await (await chef("/profile")).text(), /href="\/profile\/icloud-photos\/"/);
    assert.doesNotMatch(await (await other("/profile")).text(), /icloud-photos/);
    assert.equal(rewriteHtml('<link href="https://cdn.jsdelivr.net/x.css">'), "");
  } finally { await g.stop(); upstream.close(); delete process.env.BH_ICLOUD_LOGIN_HOST; delete process.env.BH_ICLOUD_LOGIN_PORT; delete process.env.BH_ICLOUD_PHOTOS_OWNER; }
});

test("Alte screen.json und screen-menu.json werden einmalig übernommen", async () => {
  const { mkdtempSync, writeFileSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { openDb } = await import("../lib/db.js");
  const { screenStore } = await import("../lib/screen-store.js");
  const dir = mkdtempSync(path.join(tmpdir(), "screen-"));
  writeFileSync(path.join(dir, "screen.json"), JSON.stringify({ mode: "audio", title: "Radio", text: "", url: "https://x.de/a", station: "Eins" }));
  writeFileSync(path.join(dir, "screen-menu.json"), JSON.stringify({ radio: [{ id: "a" }], mood: [] }));
  const db = openDb(":memory:");
  const store = screenStore(db, dir);
  assert.equal(store.load().mode, "audio"); assert.equal(store.load().station, "Eins"); assert.equal(store.load().id, undefined);
  assert.deepEqual(store.loadMenu(), { radio: [{ id: "a" }], mood: [] });
  assert.equal(existsSync(path.join(dir, "screen.json")), false); assert.equal(existsSync(path.join(dir, "screen.json.imported")), true);
  store.saveContent({ mode: "text", title: "Neu" });
  assert.equal(screenStore(db, dir).load().title, "Neu");
});
