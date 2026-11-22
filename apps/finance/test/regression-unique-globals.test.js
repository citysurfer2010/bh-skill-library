'use strict';
/**
 * Regression 22.11.2026: fin-import-amazon.js and fin-purchases.js both set window.FinAmazon. In the alphabetical
 * bundle the later file won, so the import page called FinAmazon.rows() on the purchases page object and broke
 * ("FinAmazon.rows is not a function"). Every component must own its global name.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('no two components assign the same window global', () => {
  const dir = path.join(__dirname, '..', 'public', 'components');
  const owner = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
      assert.ok(!owner[m[1]] || owner[m[1]] === f, `window.${m[1]} is set in ${owner[m[1]]} and ${f}`);
      owner[m[1]] = f;
    }
  }
});
