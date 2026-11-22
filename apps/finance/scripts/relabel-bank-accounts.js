#!/usr/bin/env node
'use strict';
/**
 * One run after an update: asks the bank for each account's product and description, guesses a scope for accounts
 * without one, and gives automatically named accounts ("DKB 8687", "comdirect 1405", a description account still
 * holding the bare bank name) the name the current rules would give: the flat for a rent account, the kind for savings.
 * Names a person chose are kept. `--dry` only prints what would change.
 *   node scripts/relabel-bank-accounts.js [--dry]
 */
const { getDb, closeDb } = require('../lib/db');
const bank = require('../lib/bank-api');
const accounts = require('../lib/accounts');
const { namesOf, describe } = require('../lib/bank-names');

const dry = process.argv.includes('--dry');
const savingsKind = (text) => (/tagesgeld/i.test(text) ? 'Tagesgeldkonto' : /festgeld/i.test(text) ? 'Festgeldkonto' : /spar/i.test(text) ? 'Sparkonto' : null);

(async () => {
  const db = getDb(); const out = [];
  for (const a of db.prepare('SELECT * FROM bank_accounts ORDER BY aspsp, label').all()) {
    const d = await bank.details(a.uid).catch(() => null);
    if (!d) { out.push(`${a.label}: keine Angaben von der Bank`); continue; }
    if (!dry) db.prepare('UPDATE bank_accounts SET product = ?, details = ?, usage = ? WHERE uid = ?').run(d.product || null, d.details || null, d.usage || null, a.uid);
    const base = namesOf(a.aspsp).label || a.aspsp;
    const auto = a.label === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} [0-9a-f]{4}(-[0-9a-f]{4})?$`, 'i').test(a.label);
    const kind = savingsKind(`${d.product || ''} ${d.details || ''}`);
    const wanted = kind ? `${base} ${kind}` : describe(base, d); // savings by their kind, like new accounts
    const scope = accounts.defaultScope(d);
    if (!auto || !wanted || wanted === a.label) { if (!dry) accounts.ensure(a.label, scope); out.push(`${a.label}: bleibt (${scope})`); continue; }
    if (!dry) {
      try { accounts.rename(a.label, wanted); accounts.ensure(wanted, scope); } catch (e) { out.push(`${a.label}: nicht umbenannt, ${e.message}`); continue; }
    }
    out.push(`${a.label} → ${wanted} (${scope})`);
  }
  console.log(out.join('\n'));
  closeDb();
})().catch((e) => { console.error(e.message); process.exit(1); });
