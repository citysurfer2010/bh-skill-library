'use strict';
/**
 * Regression 15.11.2026: fin-amazon.js sorted before fin-base.js in the alphabetical bundle and read `Fin` at load time,
 * so the whole bundle stopped ("Fin is not defined") and every page stayed empty. Pages that use Fin must load after it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every component that reads Fin at load time comes after fin-base.js in the bundle', () => {
  const dir = path.join(__dirname, '..', 'public', 'components');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const base = files.indexOf('fin-base.js'); assert.ok(base >= 0);
  for (const f of files.slice(0, base)) {
    // Reading Fin as the first statement of the module's IIFE runs at load time; inside a function it runs later and is fine.
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /=\s*\(\(\)\s*=>\s*\{\s*(?:'use strict';\s*)?const\s*\{[^}]*\}\s*=\s*Fin\b/, `${f} reads Fin at load time but loads before fin-base.js`);
  }
});
