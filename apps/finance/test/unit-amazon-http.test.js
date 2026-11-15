'use strict';
/** The real transport to the Amazon worker (node:http): key sent, JSON back, errors with code, own deadline instead of fetch's five minutes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('talks to the worker over node:http', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body: b });
      if (req.url === '/status') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"connected":true}'); }
      else if (req.url === '/payments') { res.writeHead(409, { 'content-type': 'application/json' }); res.end('{"error":"abgelaufen","code":"login"}'); }
      else if (req.url === '/orders') setTimeout(() => { res.writeHead(200); res.end('{"orders":[]}'); }, 400); // slower than the deadline below
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amz-http-')); fs.writeFileSync(path.join(dir, 'token'), 'geheim');
  process.env.AMAZON_URL = `http://127.0.0.1:${server.address().port}`; process.env.AMAZON_TOKEN_FILE = path.join(dir, 'token');
  const api = require('../lib/amazon-api');
  try {
    assert.deepEqual(await api.status(), { connected: true });
    assert.equal(seen[0].auth, 'Bearer geheim');
    await assert.rejects(api.payments('2025-01-01'), (e) => e.code === 'login' && e.status === 409);
    assert.equal(JSON.parse(seen[1].body).since, '2025-01-01');
    const slow = require('../lib/amazon-api');
    await assert.rejects(new Promise((resolve, reject) => { const p = slow._call('POST', '/orders', {}, 100); p.then(resolve, reject); }), /Zeit abgelaufen/);
  } finally { server.close(); }
});
