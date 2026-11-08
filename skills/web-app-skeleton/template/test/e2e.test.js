import test from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers.js";

test("Ablauf: Admin legt an, User sieht es, Admin loescht", async () => {
  const { call, close } = await startApp();
  const admin = { as: "a@b.de", role: "admin" };
  const user = { as: "u@b.de", role: "user" };
  try {
    const created = await call("/api/items", { ...admin, method: "POST", body: { title: "Erster" } });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const list = await (await call("/api/items", user)).json();
    assert.equal(list[0].title, "Erster");
    assert.equal(list[0].created_by, "a@b.de");
    assert.equal((await call(`/api/items/${id}`, { ...admin, method: "DELETE" })).status, 204);
    assert.deepEqual(await (await call("/api/items", user)).json(), []);
  } finally { await close(); }
});
