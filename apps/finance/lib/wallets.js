'use strict';
const { accountNames } = require('./account-names');
/**
 * PayPal and the credit card are wallets (22.11.2026): the debit on the bank account only moves money into them,
 * so it is a transfer while the wallet's own lines (with the real shops) are on file for that date. Without them the
 * debit is the purchase itself: counting it as a transfer would make the spending vanish from the overview.
 *  - covered (wallet account has lines up to that date): TRANS
 *  - not covered, PayPal: the shop from the text ("Ihr Einkauf bei …"); a sure learned rule for that shop books it,
 *    otherwise it stays open with the shop's category as suggestion
 *  - not covered, credit card statement: stays open (the single purchases are missing), with a hint in the note
 * Only lines nobody decided yet are changed (open, learned rule, transfer or wallet marks, earlier bulk runs).
 */
const { getDb } = require('./db');
const categorize = require('./categorize');

const WALLETS = [
  { name: 'PayPal', line: /paypal/i, account: /^paypal\b/i },
  // The card account: its name from the settings (account-names.js) or a name that says what it is.
  { name: 'Kreditkarte', line: /monatsabrechnung visa|kreditkartenabrechnung/i, account: { test: (name) => String(name).toLowerCase() === accountNames().comdirect_card.toLowerCase() || /kreditkarte|credit card/i.test(name) } },
];
const LAG_DAYS = 7;
const shift = (d, days) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const FREE = "(t.category IS NULL OR t.category_source IN ('rule', 'transfer', 'wallet', 'bulk'))";
const shopOf = (text) => {
  const t = String(text || '');
  const m = /Einkauf bei\s+([A-Za-zÄÖÜäöüß0-9][^,;.]{1,40})/i.exec(t) || /PayPal Europe[^,;]*?,\s*\.?\s*([A-Za-zÄÖÜäöüß0-9][^,;.]{2,40})/i.exec(t);
  return (m?.[1] || '').replace(/\s+(Lastschrift|Gutschrift|Überweisung).*$/i, '').trim();
};

function detect() {
  const db = getDb(); const codes = new Set(db.prepare('SELECT code FROM categories').all().map((r) => r.code));
  if (!codes.has('TRANS')) return { transfers: 0, booked: 0, open: 0 };
  const accounts = db.prepare('SELECT account, max(booked_on) AS last FROM transactions GROUP BY account').all();
  const set = db.prepare("UPDATE transactions SET category = ?, category_source = 'wallet', suggestion = ? WHERE id = ?");
  let transfers = 0; let booked = 0; let open = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const w of WALLETS) {
      const own = accounts.filter((a) => w.account.test(a.account)); const last = own.reduce((m, a) => (a.last > m ? a.last : m), '');
      const names = own.map((a) => a.account);
      const rows = db.prepare(`SELECT t.id, t.account, t.booked_on, t.text, t.counterparty, t.category, t.category_source, t.suggestion FROM transactions t WHERE ${FREE}`).all()
        .filter((r) => !names.includes(r.account) && w.line.test(`${r.counterparty} ${r.text}`));
      for (const r of rows) {
        // The bank debit often comes a few days after the wallet line, so a week after the last wallet line still counts.
        if (last && r.booked_on <= shift(last, LAG_DAYS)) { if (r.category !== 'TRANS' || r.category_source !== 'wallet') { set.run('TRANS', null, r.id); transfers += 1; } continue; }
        const shop = w.name === 'PayPal' ? shopOf(r.text) : '';
        const s = shop ? categorize.suggest(shop) : null;
        const hint = s && codes.has(s.category) && s.category !== 'TRANS' ? s.category : null;
        if (hint && s.sure) { if (r.category !== hint) { set.run(hint, null, r.id); booked += 1; } } else if (r.category !== null || r.suggestion !== hint) {
          db.prepare('UPDATE transactions SET category = NULL, category_source = NULL, suggestion = ? WHERE id = ?').run(hint, r.id); open += 1;
        }
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { transfers, booked, open };
}

module.exports = { detect, shopOf, WALLETS };
