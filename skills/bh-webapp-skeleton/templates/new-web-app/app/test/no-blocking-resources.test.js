'use strict';
/**
 * Ratchet: nichts von außen blockiert das erste Zeichnen. Jedes externe Stylesheet braucht media="print" onload, jedes externe
 * Script async oder defer; besser: selbst ausliefern. Zeilen mit `load-exempt: <Grund>` werden übersprungen. ALLOWLIST nur für Altbestand.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const ALLOWLIST = {};

function pages(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/(^|[\\/])(node_modules|vendor|assets|compiled)$/.test(p)) continue;
    if (e.isDirectory()) pages(p, out); else if (/\.html$/.test(e.name)) out.push(p);
  }
  return out;
}

const STYLE = /<link[^>]*(rel="stylesheet"[^>]*href="https?:\/\/|href="https?:\/\/[^>]*rel="stylesheet")[^>]*>/;
const SCRIPT = /<script[^>]*\ssrc="https?:\/\/[^>]*>/;

function blocking(src) {
  // lines carrying `load-exempt:` are skipped first; then comments are removed so commented-out tags do not count
  const kept = src.split('\n').filter((line) => !/load-exempt:/.test(line)).join('\n');
  return kept.replace(/<!--[\s\S]*?-->/g, '').split('\n').filter((line) => {
    if (STYLE.test(line)) return !/media="print"/.test(line);
    if (SCRIPT.test(line)) return !/\b(async|defer)\b/.test(line);
    return false;
  }).length;
}

test('no render-blocking third-party resource in public/**/*.html beyond the allowlist; counts never grow', () => {
  const errs = [];
  for (const f of pages(path.join(APP, 'public'))) {
    const rel = path.relative(APP, f).split(path.sep).join('/');
    const n = blocking(fs.readFileSync(f, 'utf8'));
    const allowed = ALLOWLIST[rel] || 0;
    if (n > allowed) errs.push(`${rel}: ${n} blocking resource(s), allowed ${allowed} — self-host it, load it non-blocking (media="print" onload / defer), or mark the line "load-exempt: <reason>"`);
  }
  assert.deepEqual(errs, []);
});

test('the checker itself detects blocking resources and honours the exemptions', () => {
  assert.equal(blocking('<link href="https://x/y.css" rel="stylesheet">'), 1);
  assert.equal(blocking('<link rel="stylesheet" href="https://x/y.css">'), 1);
  assert.equal(blocking('<link href="https://x/y.css" rel="stylesheet" media="print" onload="this.media=\'all\'">'), 0);
  assert.equal(blocking('<script src="https://x/a.js"></script>'), 1);
  assert.equal(blocking('<script src="https://x/a.js" defer></script>'), 0);
  assert.equal(blocking('<script src="https://x/a.js"></script> <!-- load-exempt: vendor sdk must run first -->'), 0);
  assert.equal(blocking('<script src="/local/a.js"></script>'), 0);
});
