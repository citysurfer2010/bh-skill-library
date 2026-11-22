'use strict';
/** Finance MCP: talks to the finance app with its key, turns cents into euros, explains a missing setup or a revoked key. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const seen = [];
const stub = http.createServer((req, res) => {
  seen.push({ url: req.url, auth: req.headers.authorization });
  if (req.headers.authorization !== 'Bearer bhfin_test') { res.writeHead(401); return res.end('{}'); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(req.url.startsWith('/finance/api/external/finance/loans')
    ? { totals: { balance: 12345678 }, loans: [{ lender: 'Bank', balance_now_cents: 9000000, rate_pct: 1.5 }] }
    : { count: 1, sum_cents: -2398, transactions: [{ amount_cents: -2398, counterparty: 'Shop' }] }));
});

function rpc(env, msgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, ...env } });
    let out = ''; child.stdout.on('data', (c) => { out += c; });
    for (const m of msgs) child.stdin.write(`${JSON.stringify(m)}\n`);
    setTimeout(() => { child.kill(); resolve(out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))); }, 1500);
  });
}

test.before(() => new Promise((r) => stub.listen(0, '127.0.0.1', r)));
test.after(() => stub.close());

test('lists five read-only tools and answers in euros with the key', async () => {
  const env = { BH_FINANCE_URL: `http://127.0.0.1:${stub.address().port}/finance`, BH_FINANCE_KEY: 'bhfin_test' };
  const [list, loans, tx] = await rpc(env, [
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_loans', arguments: {} } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_transactions', arguments: { q: 'Kabel', year: 'all', limit: 5 } } },
  ].map((m) => m));
  assert.deepEqual(list.result.tools.map((t) => t.name).sort(), ['get_estate', 'get_housing', 'get_investments', 'get_loans', 'get_overview', 'search_transactions']);
  const l = JSON.parse(loans.result.content[0].text);
  assert.equal(l.totals.balance, 123456.78); assert.equal(l.loans[0].balance_now_eur, 90000);
  assert.equal(JSON.parse(tx.result.content[0].text).sum_eur, -23.98);
  assert.ok(seen.some((s) => s.url === '/finance/api/external/finance/transactions?q=Kabel&year=all&limit=5'));
});

test('without setup or with a revoked key the tool says so plainly', async () => {
  const [none] = await rpc({ BH_FINANCE_URL: '', BH_FINANCE_KEY: '' }, [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_estate', arguments: {} } }]);
  assert.match(none.result.content[0].text, /nicht eingerichtet/); assert.equal(none.result.isError, true);
  const [bad] = await rpc({ BH_FINANCE_URL: `http://127.0.0.1:${stub.address().port}/finance`, BH_FINANCE_KEY: 'bhfin_alt' }, [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_estate', arguments: {} } }]);
  assert.match(bad.result.content[0].text, /Kein Zugang/);
});

test('every tool counts as read-only for Zottel (a read verb in its name)', () => {
  const READ = /(^|_)(list|get|search|read|find)(_|$)/; // subset of apps/zottel/lib/tool-policy.js
  for (const t of require('../tools/index.js').TOOL_NAMES) assert.match(`finance_${t}`, READ, t); // the gateway prefixes the server id
});
