'use strict';
/**
 * Ratchet: no native <select>/<datalist> in the UI. Every dropdown is BHSelectCore (public/components/bh-select.js):
 * `<div data-bh-select data-options='[…]'>` + BHSelectCore.mountAll(root). ALLOWLIST for legacy code only, counts may only fall.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const ALLOWLIST = {};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/(^|[\\/])(node_modules|vendor|compiled)$/.test(p)) continue;
    if (e.isDirectory()) walk(p, out); else if (/\.(js|jsx|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
const count = (src) => (src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '').match(/<(select|datalist)[\s>]/g) || []).length;

test('no native <select>/<datalist> beyond the allowlist; counts never grow', () => {
  const errs = [];
  for (const f of walk(path.join(APP, 'public'))) {
    const rel = path.relative(APP, f).split(path.sep).join('/'), n = count(fs.readFileSync(f, 'utf8')), ok = ALLOWLIST[rel] || 0;
    if (n > ok) errs.push(`${rel}: ${n} native select/datalist (allowed: ${ok}) — use BHSelectCore (components/bh-select.js, data-bh-select + mountAll), never a native <select>.`);
  }
  assert.deepEqual(errs, [], '\n' + errs.join('\n'));
});

test('BHSelect is part of the bundle: component, stylesheet module', () => {
  const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');
  assert.match(read('public/components/bh-select.js'), /window\.BHSelectCore\s*=/);
  assert.match(read('public/css/bh-select.css'), /\.bhs__pop/);
  assert.match(read('lib/assets.js'), /CSS_MODULES = \[[^\]]*'bh-select'/);
});
