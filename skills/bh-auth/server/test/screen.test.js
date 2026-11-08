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
    assert.deepEqual(await (await fetch(`${g.base}/screen/lesen/content`)).json(), { title: "Hallo", text: "Welt" });
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
