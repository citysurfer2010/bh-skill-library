'use strict';
/** Ledger names for new bank accounts: the usual name for the current account, the kind for savings, the bank's description otherwise. */
const crypto = require('crypto');
const { getDb } = require('./db');
const { accountNames } = require('./account-names');

// The current account gets the bank's usual ledger name, a card its card name; both are settings (account-names.js).
const BANKS = [{ name: 'Comdirect', key: 'comdirect', card: 'comdirect_card' }, { name: 'BBBank', key: 'bbbank' }, { name: 'DKB', key: 'dkb' }, { name: 'PayPal', key: 'paypal' }];
/** Ledger name and card name of a bank from the settings. */
function namesOf(aspsp) { const n = accountNames(); const b = BANKS.find((x) => x.name === aspsp); return b ? { label: n[b.key], card: b.card ? n[b.card] : null } : { label: aspsp, card: null }; }
const productOf = (a) => [a.product, a.details].filter(Boolean).join(' ');
/** Current accounts first, so they get the usual ledger name before any other account of the same bank. */
const rank = (a) => (/giro|current|privatkonto/i.test(productOf(a)) ? 0 : /tagesgeld|spar|festgeld/i.test(productOf(a)) ? 2 : 1);

/** "XYZ - BLN, Musterweg 1 - WE01" → "BLN, Musterweg 1 - WE01"; a bare word gets the bank in front. */
function describe(bankLabel, a) {
  let d = String(a.details || '').replace(/\s+/g, ' ').trim();
  if (!d || d === a.product || /^giro/i.test(d)) return '';
  const m = /^[A-ZÄÖÜ]{2,5}\s*-\s*(.+)$/.exec(d); if (m) d = m[1];
  return (d.includes(' ') ? d : `${bankLabel} ${d}`).slice(0, 60);
}
const unique = (name, taken) => { let n = name; for (let i = 2; taken(n); i += 1) n = `${name} (${i})`; return n; };

/** A free ledger name for a new bank account: the usual name by account type first, then bank plus IBAN end. */
function labelFor(aspsp, account) {
  const db = getDb(); const b = namesOf(aspsp);
  const iban = account.account_id?.iban || ''; const type = account.cash_account_type || '';
  const taken = (l) => !!db.prepare('SELECT 1 FROM bank_accounts WHERE label = ?').get(l);
  // comdirect reports its Tagesgeld as CACC too; only the product name tells a current account from savings.
  const product = productOf(account);
  const savings = /tagesgeld|spar|festgeld|savings/i.test(product) || type === 'SVGS';
  const card = type === 'CARD' || /kredit|visa|card/i.test(product);
  const giro = /giro|current|privatkonto/i.test(product) || (!product && (!type || type === 'CACC'));
  // An account the bank describes on its own (a flat's rent account, a business account) is named by that description.
  const desc = describe(b.label, account);
  if (!savings && !card && desc) return unique(desc, taken);
  const wanted = card && b.card ? b.card : !savings && !card && (giro || aspsp === 'PayPal') ? b.label : null;
  if (wanted && !taken(wanted)) return wanted;
  // Savings show what they are (15.11.2026: "Tagesgeld sollte als Tagesgeldkonto ausgewiesen sein").
  const kind = !savings ? null : /tagesgeld/i.test(product) ? 'Tagesgeldkonto' : /festgeld/i.test(product) ? 'Festgeldkonto' : 'Sparkonto';
  if (kind && !taken(`${b.label} ${kind}`)) return `${b.label} ${kind}`;
  const alt = `${b.label} ${kind ? `${kind} ` : ''}${iban ? iban.slice(-4) : crypto.randomBytes(2).toString('hex')}`;
  return taken(alt) ? `${alt}-${crypto.randomBytes(2).toString('hex')}` : alt;
}

module.exports = { BANKS, namesOf, rank, labelFor, describe };
