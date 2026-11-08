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
    assert.deepEqual(await (await fetch(`${g.base}/screen/lesen/content`)).json(), { mode: "text", title: "Hallo", text: "Welt", url: null, offer: null, session: null, answer: null });
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
