// Starts all apps under /apps/<slug>/ and brings crashed ones back.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = "/apps";
const children = new Map();
let stopping = false;

function log(slug, chunk) {
  for (const line of String(chunk).split("\n")) if (line.trim()) console.log(`[${slug}] ${line}`);
}

function start(slug, meta, delay = 1000) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: path.join(ROOT, slug, "code"),
    env: { PATH: process.env.PATH, HOME: "/tmp", NODE_ENV: "production", PORT: String(meta.port), HOST: "0.0.0.0", DATA_DIR: path.join(ROOT, slug, "data"), TRUST_PROXY_AUTH: "1", BH_MCP_URL: "http://mcp-gateway:18800/mcp", BH_GATEWAY_TOKEN_FILE: "/etc/devbox/llm/token" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(slug, child);
  child.stdout.on("data", (d) => log(slug, d));
  child.stderr.on("data", (d) => log(slug, d));
  child.on("exit", (code) => {
    children.delete(slug);
    if (stopping) return;
    // Whoever ran long restarts at once; whoever crashes at once waits longer and longer.
    const next = Date.now() - startedAt > 60_000 ? 1000 : Math.min(delay * 2, 30_000);
    log(slug, `beendet (${code}), neuer Start in ${next} ms`);
    setTimeout(() => { if (!stopping) start(slug, meta, next); }, next);
  });
}

for (const slug of readdirSync(ROOT)) {
  const file = path.join(ROOT, slug, "app.json");
  if (existsSync(file) && existsSync(path.join(ROOT, slug, "code", "server.js"))) start(slug, JSON.parse(readFileSync(file, "utf8")));
}
console.log(`bh-apps: ${children.size} App(s) gestartet`);

function stop() {
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => {}, 3_600_000);
