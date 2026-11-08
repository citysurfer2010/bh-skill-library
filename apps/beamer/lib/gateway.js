'use strict';
/** Ruft die Beamer-Werkzeuge über das zentrale MCP-Gateway auf. Die App spricht den Beamer nie selbst an. */
const fs = require('fs');

const TIMEOUT_MS = 45_000;

async function realCall(name, args) {
  const url = process.env.BH_MCP_URL;
  const file = process.env.BH_GATEWAY_TOKEN_FILE;
  if (!url || !file) throw new Error('Gateway ist nicht eingerichtet');
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${fs.readFileSync(file, 'utf8').trim()}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch { throw new Error('Gateway nicht erreichbar'); }
  const body = await response.json().catch(() => null);
  if (!body) throw new Error(`Gateway antwortet nicht (${response.status})`);
  if (body.error) throw new Error(body.error.message);
  const text = (body.result?.content || []).map((c) => c.text).join(' ');
  if (body.result?.isError) throw new Error(text || 'Beamer meldet einen Fehler');
  return text;
}

let caller = realCall;
const setCaller = (fn) => { caller = fn || realCall; };
const call = (name, args = {}) => caller(name, args);

module.exports = { call, setCaller };
