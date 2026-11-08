'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-'));
const realFetch = global.fetch;
const reply = (status, body) => ({ status, text: async () => JSON.stringify(body) });

function connect() {
  const f = path.join(process.env.HOME, '.config/bh-github/token');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'tok');
}

test('alle Werkzeuge laden', () => {
  const { TOOL_NAMES } = require('../tools/index.js');
  assert.deepEqual([...TOOL_NAMES].sort(), ['auth_status', 'pr_close', 'pr_create', 'pr_list', 'pr_merge', 'pr_review_radar', 'pr_status']);
});

test('ohne Verbindung klare Meldung', async () => {
  await assert.rejects(require('../lib/github.js').gh('GET', '/user'), /noch nicht verknuepft/);
});

test('merge wartet auf Merge-Faehigkeit und bindet an den geprueften Stand', async () => {
  connect();
  const states = [null, true]; const calls = [];
  global.fetch = async (url, init) => {
    calls.push([init.method, url, init.body]);
    if (init.method === 'PUT') return reply(200, { sha: 'merged' });
    return reply(200, { merged: false, mergeable: states.shift(), mergeable_state: 'clean', head: { sha: 'abc' } });
  };
  try {
    const r = await require('../tools/pr/merge.js').handler({ repo: 'a/b', pr: 1 }, { wait: async () => {} });
    assert.equal(r.isError, undefined);
    assert.equal(JSON.parse(calls.at(-1)[2]).sha, 'abc');
  } finally { global.fetch = realFetch; }
});

test('merge lehnt nicht mergebare PRs ab', async () => {
  connect();
  global.fetch = async () => reply(200, { merged: false, mergeable: false, mergeable_state: 'dirty', head: { sha: 'x' } });
  try {
    const r = await require('../tools/pr/merge.js').handler({ repo: 'a/b', pr: 1 }, { wait: async () => {} });
    assert.equal(r.isError, true);
  } finally { global.fetch = realFetch; }
});
