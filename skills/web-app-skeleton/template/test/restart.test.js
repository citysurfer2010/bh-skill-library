import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("Echter Start: Server kommt hoch und meldet sich gesund", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "app-"));
  const port = 39000 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, HOST: "127.0.0.1" },
    stdio: "ignore",
  });
  try {
    let healthy = false;
    for (let i = 0; i < 50 && !healthy; i++) {
      await new Promise((r) => setTimeout(r, 100));
      healthy = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false);
    }
    assert.ok(healthy, "kein gesunder Start");
  } finally { child.kill(); }
});
