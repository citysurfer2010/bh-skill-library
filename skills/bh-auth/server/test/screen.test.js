import test from "node:test";
import assert from "node:assert/strict";
import { start } from "./helpers.js";

const post = (g, token, body) => fetch(`${g.base}/screen-update`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test("Anzeige: nur mit geheimem Link lesbar, nur mit Schreib-Schluessel aenderbar", async () => {
  const g = await start();
  try {
    assert.equal((await post(g, null, { title: "x" })).status, 401);
    assert.equal((await post(g, "lesen", { title: "x" })).status, 401);
    assert.equal((await post(g, "schreiben", { title: "Hallo", text: "Welt" })).status, 204);
    assert.notEqual((await fetch(`${g.base}/screen/falsch`, { redirect: "manual" })).status, 200);
    assert.notEqual((await fetch(`${g.base}/screen/schreiben`, { redirect: "manual" })).status, 200);
    const html = await (await fetch(`${g.base}/screen/lesen`)).text();
    assert.match(html, /Hallo/); assert.match(html, /Welt/);
    assert.deepEqual(await (await fetch(`${g.base}/screen/lesen/content`)).json(), { mode: "text", title: "Hallo", text: "Welt", url: null });
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
    assert.equal((await post(g, "schreiben", { mode: "url", url: "https://de.wikipedia.org/" })).status, 204);
    const c = await (await fetch(`${g.base}/screen/lesen/content`)).json();
    assert.equal(c.mode, "url"); assert.equal(c.url, "https://de.wikipedia.org/");
  } finally { await g.stop(); }
});

