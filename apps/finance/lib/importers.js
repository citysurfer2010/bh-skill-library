'use strict';
const { accountNames } = require('./account-names'); // the file's account: a name from the settings, never from the code
/** Reads bank exports (comdirect, BBBank, PayPal) and the JSON taken over from the old spreadsheet. */
const { toCents, toDay } = require('./money');
const { extract } = require('./counterparty');

function decode(buffer) {
  const utf8 = buffer.toString('utf8');
  return utf8.includes('�') ? buffer.toString('latin1') : utf8.replace(/^﻿/, '');
}

function parseCsv(text) {
  const firstLines = text.split(/\r?\n/).slice(0, 30).join('\n');
  const sep = (firstLines.match(/;/g) || []).length >= (firstLines.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// PayPal top-ups and withdrawals mirror a line on the bank account (booked there as TRANS); counting both would double them.
const PAYPAL_TRANSFERS = new Set(['bankgutschrift auf paypal-konto', 'von nutzer eingeleitete abbuchung', 'ach-überweisung als zahlungsquelle für ausgleich von kontoguthaben', 'rückbuchung von ach-gutschrift']);
const norm = (h) => String(h).toLowerCase().replace(/\s+/g, ' ').trim();
const FORMATS = [
  { id: 'comdirect', account: 'comdirect', need: ['buchungstag', 'umsatz in eur', 'buchungstext'], map: (r) => ({ date: r.buchungstag, amount: r['umsatz in eur'], kind: r.vorgang, text: r.buchungstext }) },
  { id: 'bbbank', account: 'bbbank', need: ['buchungstag', 'betrag', 'name zahlungsbeteiligter'], map: (r) => ({ date: r.buchungstag, amount: r.betrag, kind: r.buchungstext, text: [r['name zahlungsbeteiligter'], r.verwendungszweck].filter(Boolean).join(' '), counterparty: r['name zahlungsbeteiligter'] }) },
  { id: 'paypal', account: 'paypal', need: ['datum', 'brutto', 'name'], map: (r) => ({ date: r.datum, amount: r.brutto, kind: r.beschreibung || r.typ, text: [r.name, r.beschreibung].filter(Boolean).join(' · '), counterparty: r.name }), skip: (r) => PAYPAL_TRANSFERS.has(norm(r.beschreibung || r.typ || '')) },
];

/** Returns { format, account, rows: [{ date, cents, kind, text, counterparty }] } or throws a readable error. */
function parseBankFile(buffer, accountOverride) {
  const rows = parseCsv(decode(buffer));
  for (let h = 0; h < Math.min(rows.length, 30); h++) {
    const head = rows[h].map(norm);
    const format = FORMATS.find((f) => f.need.every((n) => head.includes(n)));
    if (!format) continue;
    const out = [];
    for (const raw of rows.slice(h + 1)) {
      const r = Object.fromEntries(head.map((k, i) => [k, (raw[i] || '').trim()]));
      if (format.skip?.(r)) continue;
      const m = format.map(r); const date = toDay(m.date); const cents = toCents(m.amount);
      if (!date || cents === null) continue; // Footer lines such as "Alter Kontostand".
      out.push({ date, cents, kind: m.kind || '', text: m.text || '', counterparty: m.counterparty || extract(m.text) });
    }
    if (!out.length) throw new Error('Die Datei enthält keine Buchungen.');
    return { format: format.id, account: accountOverride || accountNames()[format.account] || format.account, rows: out };
  }
  throw new Error('Format nicht erkannt. Unterstützt sind CSV-Exporte von comdirect, BBBank und PayPal.');
}

module.exports = { parseBankFile, parseCsv, FORMATS, PAYPAL_TRANSFERS };
