// Zentrales MCP-Gateway: ein HTTP-Endpunkt je Installation, Werkzeuge laufen hier, nie beim User.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { userFromRequest } from "./lib/auth.mjs";
import { BackendPool } from "./lib/backend.mjs";
import { Registry } from "./lib/registry.mjs";
import { storeGithubToken } from "./lib/connect.mjs";

const MAX_BODY = 16 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("zu gross"), { http: 413 })); req.destroy(); return; }
      parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function handleRpc(registry, user, msg) {
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return reply({ protocolVersion: params?.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "bh-mcp-gateway", version: "1.0.0" } });
    case "ping": return reply({});
    case "tools/list": return reply({ tools: await registry.list(user) });
    case "tools/call": return reply(await registry.call(user, params?.name, params?.arguments || {}));
    default: return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unbekannte Methode: ${method}` } };
  }
}

export function createGateway({ servers, tokensFile, usersDir }) {
  const pool = new BackendPool(usersDir);
  const registry = new Registry(servers, pool);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/health") return send(res, 200, { ok: true });
      const user = userFromRequest(req, tokensFile);
      if (!user) return send(res, 401, { error: "unauthorized" });
      if (req.method === "POST" && req.url === "/connect/github") {
        const { status, ...rest } = await storeGithubToken(pool.homeOf(user), JSON.parse(await readBody(req)).token);
        return send(res, status, rest);
      }
      if (req.url !== "/mcp") return send(res, 404, { error: "not found" });
      if (req.method !== "POST") return send(res, 405, { error: "nur POST" });
      const msg = JSON.parse(await readBody(req));
      if (msg.id === undefined) return send(res, 202);
      try {
        return send(res, 200, await handleRpc(registry, user, msg));
      } catch (e) {
        return send(res, 200, { jsonrpc: "2.0", id: msg.id, error: { code: e.code || -32000, message: e.message } });
      }
    } catch (e) {
      return send(res, e.http || 400, { error: e.message });
    }
  });
  server.on("close", () => pool.stopAll());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const servers = JSON.parse(readFileSync(process.env.MCP_SERVERS_FILE || "/opt/skills/bh-mcp-gateway/servers.json", "utf8"))
    .map((s) => ({ ...s, env: { GOOGLE_CLIENT_SECRET_FILE: "/etc/mcp-gateway/google/client_secret.json" } }));
  createGateway({
    servers,
    tokensFile: process.env.MCP_TOKENS_FILE || "/etc/mcp-gateway/tokens/user-tokens.json",
    usersDir: process.env.MCP_USERS_DIR || "/var/lib/mcp-gateway/users",
  }).listen(18800, "0.0.0.0", () => console.log("bh-mcp-gateway auf :18800"));
}
