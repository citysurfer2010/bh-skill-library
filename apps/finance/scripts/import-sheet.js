#!/usr/bin/env node
'use strict';
/**
 * One-off takeover of the old spreadsheet. Reads JSON from stdin:
 *   { categories: [{ code, art, name, description, budget }], transactions: [{ account, date, amount, kind, text, category, note }] }
 * Categories are added or updated, transactions keep their category, then the learning rules are rebuilt.
 *   node scripts/import-sheet.js < sheet.json
 */
const { getDb, closeDb } = require('../lib/db');
const ledger = require('../lib/ledger');
const categorize = require('../lib/categorize');
const { extract } = require('../lib/counterparty');
const { toCents, toDay } = require('../lib/money');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  const db = getDb();
  const upsert = db.prepare('INSERT INTO categories (code, art, name, description, budget_cents) VALUES (?, ?, ?, ?, ?) ON CONFLICT (code) DO UPDATE SET art = excluded.art, name = excluded.name, description = excluded.description, budget_cents = COALESCE(categories.budget_cents, excluded.budget_cents)');
  for (const c of data.categories || []) upsert.run(c.code, c.art, c.name || c.code, c.description || '', c.budget == null ? null : toCents(c.budget));
  const byAccount = new Map();
  for (const t of data.transactions || []) {
    const date = toDay(t.date); const cents = toCents(t.amount);
    if (!date || cents === null) continue;
    const list = byAccount.get(t.account) || []; byAccount.set(t.account, list);
    list.push({ date, cents, kind: t.kind || '', text: t.text || '', counterparty: t.counterparty || extract(t.text), category: t.category || null, note: t.note || '' });
  }
  let added = 0; let duplicates = 0;
  for (const [account, rows] of byAccount) {
    const r = ledger.importRows({ filename: 'Finanzreport (Tabelle)', format: 'sheet', account, rows, user: 'import', keepCategories: true });
    added += r.added; duplicates += r.duplicates;
  }
  categorize.rebuild();
  require('../lib/transfers').detect(); require('../lib/text-rules').detect();
  console.log(JSON.stringify({ categories: (data.categories || []).length, added, duplicates, rules: db.prepare('SELECT count(*) AS n FROM rules').get().n }));
  closeDb();
});
