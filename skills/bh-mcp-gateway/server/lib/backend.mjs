// Je User und Server ein eigener Prozess, mit dem Home des Users als HOME.
// So sieht ein Werkzeug nur die Anmeldung der Person, die es aufruft.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const TIMEOUT_MS = 120_000;
const IDLE_MS = 15 * 60_000;

class Backend {
  constructor(server, home, onExit) {
    this.pending = new Map();
    this.nextId = 1;
    this.lastUsed = Date.now();
    this.buffer = "";
    this.child = spawn(server.command[0], server.command.slice(1), {
      env: { PATH: process.env.PATH, HOME: home, NODE_NO_WARNINGS: "1", ...server.env },
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.child.stdout.setEncoding("utf8").on("data", (d) => this.onData(d));
    this.child.on("exit", () => {
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error("Werkzeug-Prozess beendet")); }
      this.pending.clear();
      onExit();
    });
    this.child.on("error", (e) => console.error(`[backend] ${e.message}`));
    this.ready = this.send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "bh-mcp-gateway", version: "1" } });
  }

  onData(chunk) {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, i);
      this.buffer = this.buffer.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    }
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Zeitueberschreitung")); }, TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async request(method, params) {
    this.lastUsed = Date.now();
    await this.ready;
    return this.send(method, params);
  }

  stop() { this.child.kill(); }
}

export class BackendPool {
  constructor(usersDir) {
    this.usersDir = usersDir;
    this.backends = new Map();
    this.reaper = setInterval(() => this.reapIdle(), 60_000);
    this.reaper.unref();
  }

  homeOf(user) {
    const home = path.join(this.usersDir, user);
    mkdirSync(home, { recursive: true, mode: 0o700 });
    return home;
  }

  get(user, server) {
    const key = `${user}/${server.id}`;
    if (!this.backends.has(key)) {
      this.backends.set(key, new Backend(server, this.homeOf(user), () => this.backends.delete(key)));
    }
    return this.backends.get(key);
  }

  reapIdle() {
    for (const b of this.backends.values()) if (Date.now() - b.lastUsed > IDLE_MS) b.stop();
  }

  stopUser(user) { for (const [key, b] of this.backends) if (key.startsWith(`${user}/`)) b.stop(); }

  stopAll() { clearInterval(this.reaper); for (const b of this.backends.values()) b.stop(); }
}
