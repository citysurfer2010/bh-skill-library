'use strict';
/**
 * Lesson 15.11.2026: BHSelectCore.create does not redraw itself. A select whose onChange only stores the value
 * (no re-render) must call update({ value }), otherwise the bank picker kept showing the first bank.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'public', 'components');
test('selects that keep their page call update with the new value', () => {
  for (const f of fs.readdirSync(DIR).filter((n) => n.startsWith('fin-'))) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const m of src.matchAll(/BHSelectCore\.create\([^\n]*onChange: \(v\) => \{([^}]*)\}/g)) {
      assert.match(m[1], /\.update\(\{ value: v/, `${f}: onChange stores the value but does not show it`);
    }
  }
});
