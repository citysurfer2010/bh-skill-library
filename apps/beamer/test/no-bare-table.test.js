'use strict';
/**
 * Ratchet: Tabellen sind BHDataTable. Eine handgebaute <table> hat keine ziehbaren Spalten, kein Sortieren über alle Zeilen, keine feste Kopfzeile.
 * ALLOWLIST nur für Altbestand, Zahlen dürfen nur sinken. <table> in E-Mail-/Druck-HTML: Zeile mit `table-exempt: <Grund>` markieren.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
// app-shell.js: AppShell.list, die kleine statische Liste. bh-data-table.js: die Tabelle selbst.
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

// Die Beispielseite des Skeletons ist ersetzt; diese App hat keine Tabellen. Die Bausteine bleiben Pflicht.
test('Tabellen-Bausteine sind vorhanden', () => {
  for (const f of ['bh-data-table.js', 'bh-list-page.js']) assert.ok(fs.existsSync(path.join(APP, 'public', 'components', f)), f);
});

