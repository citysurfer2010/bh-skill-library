import test from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers.js";

// Jede neue Route bekommt hier eine Zeile: [Methode, Pfad, Status je Rolle].
const ROUTES = [
  ["GET", "/api/me", { anon: 401, user: 200, admin: 200 }],
  ["GET", "/api/items", { anon: 401, user: 200, admin: 200 }],
  ["POST", "/api/items", { anon: 401, user: 403, admin: 400 }],
  ["DELETE", "/api/items/999", { anon: 401, user: 403, admin: 404 }],
];

for (const [method, path, expected] of ROUTES) {
  test(`${method} ${path}`, async () => {
    const { call, close } = await startApp();
    try {
      assert.equal((await call(path, { method })).status, expected.anon, "anon");
      assert.equal((await call(path, { method, as: "u@b.de", role: "user" })).status, expected.user, "user");
      assert.equal((await call(path, { method, as: "a@b.de", role: "admin" })).status, expected.admin, "admin");
    } finally { await close(); }
  });
}

test("Unbekannte Rolle zaehlt als user", async () => {
  const { call, close } = await startApp();
  try {
    assert.equal((await call("/api/items", { method: "POST", as: "x@b.de", role: "root", body: { title: "t" } })).status, 403);
  } finally { await close(); }
});

test("Ohne TRUST_PROXY_AUTH werden Kopfzeilen ignoriert", async () => {
  const { call, close } = await startApp();
  delete process.env.TRUST_PROXY_AUTH;
  try {
    assert.equal((await call("/api/me", { as: "gefaelscht@b.de", role: "admin" })).status, 401);
  } finally { await close(); }
});
