'use strict';
/** Tools of the central MCP gateway, always run on behalf of the signed-in user. */
const fs = require('fs');

const URL_MCP = process.env.BH_MCP_URL || 'http://mcp-gateway:18800/mcp';
const TOKEN_FILE = process.env.BH_GATEWAY_TOKEN_FILE || '/etc/devbox/llm/token';
const SECRET_FILE = process.env.BH_ACT_AS_FILE || '/etc/devbox/llm/act-as-secret';
const TIMEOUT_MS = 110_000;
const CATALOG_MS = 5 * 60_000;

// The same rule the platform uses to name a user's workspace.
const gatewayUser = (email) => String(email).split('@')[0].toLowerCase();

async function realRpc(email, method, params) {
  const res = await fetch(URL_MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${fs.readFileSync(TOKEN_FILE, 'utf8').trim()}`,
      'x-act-as': gatewayUser(email),
      'x-act-as-secret': fs.readFileSync(SECRET_FILE, 'utf8').trim(),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!body) throw new Error(`Gateway antwortet nicht (${res.status})`);
  if (body.error) throw new Error(typeof body.error === 'string' ? body.error : body.error.message);
  return body.result;
}

let rpc = realRpc;
const catalogs = new Map();
const setRpc = (fn) => { rpc = fn || realRpc; catalogs.clear(); };

async function listTools(email) {
  const hit = catalogs.get(email);
  if (hit && Date.now() - hit.at < CATALOG_MS) return hit.tools;
  const { tools } = await rpc(email, 'tools/list', {});
  catalogs.set(email, { at: Date.now(), tools });
  return tools;
}

async function callTool(email, name, args) {
  const result = await rpc(email, 'tools/call', { name, arguments: args || {} });
  const text = (result?.content || []).map((c) => c.text || '').join('\n');
  if (result?.isError) throw new Error(text || 'Werkzeug meldet einen Fehler');
  return text;
}

module.exports = { listTools, callTool, setRpc, gatewayUser };
