'use strict';
/** Turns an Enable Banking transaction (Berlin Group / ISO 20022 shape) into a ledger row. */
const crypto = require('crypto');
const { toCents } = require('./money');
const { extract } = require('./counterparty');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function toRow(t) {
  const date = [t.booking_date, t.value_date, t.transaction_date].find((d) => DAY.test(String(d || '')));
  const cents = toCents(Number(t.transaction_amount?.amount));
  if (!date || cents === null) return null;
  const signed = t.credit_debit_indicator === 'DBIT' ? -Math.abs(cents) : Math.abs(cents);
  const text = clean([].concat(t.remittance_information || []).join(' '));
  const party = clean(signed < 0 ? t.creditor?.name : t.debtor?.name);
  const kind = clean(t.bank_transaction_code?.description || t.bank_transaction_code?.code || '');
  // Banks give a stable id; without one, the content stands in (equal lines get their position among equals later).
  const ref = clean(t.entry_reference || t.transaction_id) || `c:${crypto.createHash('sha256').update([date, signed, text, party].join('|')).digest('hex').slice(0, 24)}`;
  return { date, cents: signed, kind, text: text || party, counterparty: party || extract(text), ref };
}

/** Rows with the same content-derived ref are real repeats; they are numbered so none is lost. */
function toRows(list) {
  const seen = new Map();
  return (list || []).map(toRow).filter(Boolean).map((r) => {
    if (!r.ref.startsWith('c:')) return r;
    const n = (seen.get(r.ref) || 0) + 1; seen.set(r.ref, n);
    return n > 1 ? { ...r, ref: `${r.ref}:${n}` } : r;
  });
}

module.exports = { toRow, toRows };
