'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { holdEarly } = require('../lib/terminal-ws');

test('input sent before the container connection is ready is not lost', () => {
  const ws = new EventEmitter();
  const release = holdEarly(ws);
  ws.emit('message', 'opencode');
  const seen = [];
  release((m) => seen.push(m));
  ws.emit('message', 'second');
  assert.deepEqual(seen, ['opencode', 'second']);
  assert.equal(ws.listenerCount('message'), 1);
});

test('early input is bounded', () => {
  const ws = new EventEmitter();
  const release = holdEarly(ws);
  for (let i = 0; i < 5000; i++) ws.emit('message', 'x');
  const seen = [];
  release((m) => seen.push(m));
  assert.equal(seen.length, 256);
});

function initialTabs() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/components/term-app.js'), 'utf8'), { window });
  return window.TermApp.initialTabs;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const A = { id: 'aaa', label: '' }; const B = { id: 'bbb', label: 'opencode' };

test('a session in the address opens only that session in a fresh window', () => {
  assert.deepEqual(plain(initialTabs()('bbb', [], [A, B])), [B]);
});

test('an unknown session in the address starts a new one with that id', () => {
  assert.deepEqual(plain(initialTabs()('neu', [], [A])), [{ id: 'neu', label: '' }]);
});

test('a reload keeps the tabs of this window', () => {
  assert.deepEqual(plain(initialTabs()('aaa', [A, B], [A, B])), [A, B]);
  assert.deepEqual(plain(initialTabs()('ccc', [A], [A])), [A, { id: 'ccc', label: '' }]);
});

test('without an address all known sessions return, or one new one', () => {
  assert.deepEqual(plain(initialTabs()(null, [], [A, B])), [A, B]);
  assert.deepEqual(plain(initialTabs()(null, [], [])), [{}]);
});

test('invalid session ids in the address are ignored', () => {
  for (const bad of ['../x', 'a b', 'A', 'x'.repeat(13)]) assert.deepEqual(plain(initialTabs()(bad, [], [A])), [A]);
});
