'use strict';
/** Who the money went to or came from, normalised so that the same partner always gives the same key. */
const PATTERNS = [
  /(?:Auftraggeber|Empfänger|Empfaenger|Zahlungsempfänger):\s*(.+?)(?:\s+(?:Kto|IBAN|Buchungstext|BLZ|BIC|End-to-End|Ref|Mandat)[./:\s]|$)/i,
  /^(?:Lastschrift|Gutschrift|Überweisung|Kartenzahlung)\s+(?:von|an)\s+(.+?)(?:\s{2,}|$)/i,
];

function extract(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  for (const p of PATTERNS) { const m = p.exec(s); if (m && m[1].trim()) return m[1].trim(); }
  return s.split(/\s(?:\/\/|\d{4,}|\d{2}\.\d{2}\.)/)[0].slice(0, 60);
}

function normalize(name) {
  return String(name || '').toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c]))
    .replace(/\b(gmbh|ag|se|kg|ug|eg|e\.?v\.?|co|und|and|sagt danke|danke)\b/g, ' ')
    .replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
}

module.exports = { extract, normalize };
