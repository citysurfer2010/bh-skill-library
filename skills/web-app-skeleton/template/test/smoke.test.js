import test from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers.js";

test("Grundfunktionen antworten", async () => {
  const { call, close } = await startApp();
  try {
    assert.equal((await call("/health")).status, 200);
    assert.equal((await call("/")).status, 200);
    assert.equal((await call("/api/me", { as: "a@b.de" })).status, 200);
    assert.equal((await call("/api/items", { as: "a@b.de" })).status, 200);
  } finally { await close(); }
});
