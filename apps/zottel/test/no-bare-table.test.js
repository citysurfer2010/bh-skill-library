'use strict';
/**
 * Ratchet: tables are BHDataTable. A hand-built <table> has no draggable columns, no sorting over all rows, no fixed header row.
 * ALLOWLIST for legacy code only, counts may only fall. <table> in email/print HTML: mark the line with `table-exempt: <reason>`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
// app-shell.js: AppShell.list, the small static list. bh-data-table.js: the table itself.
const ALLOWLIST = { 'public/components/app-shell.js': 1, 'public/components/bh-data-table.js': 1 };

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/(^|[\\/])(node_modules|vendor|compiled|coverage)$/.test(p)) continue;
    if (e.isDirectory()) walk(p, out); else if (/\.(js|jsx|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (src) => strip(src).split('\n').filter((l) => !/table-exempt:/.test(l)).join('\n').match(/<table[\s>]/g)?.length || 0;

test('no bare <table> beyond the allowlist; counts never grow', () => {
  const errs = [];
  for (const f of walk(path.join(APP, 'public'))) {
    const rel = path.relative(APP, f).split(path.sep).join('/');
    const n = count(fs.readFileSync(f, 'utf8')); const ok = ALLOWLIST[rel] || 0;
    if (n > ok) errs.push(`${rel}: ${n} bare <table> (allowed: ${ok}) — use BHDataTable via BHListPage/AppShell.list`);
  }
  assert.deepEqual(errs, [], '\n' + errs.join('\n'));
});
