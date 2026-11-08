/**
 * Generic Google REST API Client.
 * Alle Tools rufen `gapiJSON()` — JSON-Response wird automatisch geparsed.
 * Bei Binär-Bodies (PDF-Export, Datei-Download) `gapi()` direkt nehmen.
 */
'use strict';

const https = require('https');
const { getAccessToken } = require('./auth.js');

async function gapi(method, url, body, extraHeaders) {
  const token = await getAccessToken();
  const u     = new URL(url);
  const bodyStr = body
    ? (typeof body === 'string' ? body : JSON.stringify(body))
    : null;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(bodyStr && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
    ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
    ...extraHeaders,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function gapiJSON(method, url, body, extraHeaders) {
  const r = await gapi(method, url, body, extraHeaders);
  let parsed;
  try { parsed = JSON.parse(r.body); } catch { parsed = { _raw: r.body }; }
  return { status: r.status, data: parsed };
}

function ok(text)  { return { content: [{ type: 'text', text: String(text) }] }; }
function err(text) { return { content: [{ type: 'text', text: String(text) }], isError: true }; }
function apiErr(op, status, data) {
  const msg = data?.error?.message || data?.error || JSON.stringify(data).substring(0, 200);
  return err(`${op} Fehler ${status}: ${msg}`);
}
// Structured JSON return for programmatic consumers (Python-Skills via stdio).
// Text-Tools wrappen ihre Daten in JSON.stringify, sodass der Caller mit
// JSON.parse(content[0].text) ein typisiertes Objekt erhält statt regex-
// parsen zu müssen. Aktiviert durch das optionale Tool-Argument format:'json'.
function okJson(data) { return { content: [{ type: 'text', text: JSON.stringify(data) }] }; }

module.exports = { gapi, gapiJSON, ok, err, apiErr, okJson };
