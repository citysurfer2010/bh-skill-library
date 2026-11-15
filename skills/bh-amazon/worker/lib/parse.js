'use strict';
/**
 * Reads Amazon order cards from their visible text, not from page structure: Amazon changes its markup often,
 * the words "Bestellung aufgegeben", "Summe" and the order number pattern stay. Pure functions, tested with sample text.
 */
const ORDER_ID = /\b(\d{3}-\d{7}-\d{7})\b/;
const MONTHS = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };

/** "3. Februar 2025" → "2025-02-03" */
function germanDate(text) {
  const m = /(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})/.exec(text || '');
  const month = m && MONTHS[m[2].toLowerCase()];
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** "12,34 €", "€ 12,34", "1.234,56 €" → cents */
function euroCents(text) {
  const m = /(?:€\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s*€)?/.exec(text || '');
  return m ? Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * 100) : null;
}

/** One card: its full text plus the texts of its product links. */
function parseCard({ text, products = [] }) {
  const id = ORDER_ID.exec(text || '')?.[1];
  if (!id) return null;
  const after = (label) => { const i = text.search(label); return i < 0 ? '' : text.slice(i, i + 80); };
  const items = [...new Set(products.map((p) => String(p).replace(/\s+/g, ' ').trim()).filter((p) => p.length > 2 && !/^(artikel ansehen|erneut kaufen|produktsupport|bewertung|rücksendung|lieferung verfolgen)/i.test(p)))];
  return { id, date: germanDate(after(/Bestellung aufgegeben|Bestelldatum/i)), totalCents: euroCents(after(/Summe|Gesamtbetrag/i)), items: items.slice(0, 20) };
}

function parseCards(cards) {
  const seen = new Map();
  for (const c of cards) { const o = parseCard(c); if (o && !seen.has(o.id)) seen.set(o.id, o); }
  return [...seen.values()];
}

/**
 * One row of "Ihre Zahlungen → Transaktionen": the row text (amount, payment method, order number) plus the date
 * heading above it. Amazon charges per shipment, so one order can have several rows; refunds are positive.
 */
function parsePayment({ text, date }) {
  const id = ORDER_ID.exec(text || '')?.[1];
  const m = /([-+−]?)\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/.exec(text || '');
  if (!id || !m) return null;
  const cents = Math.round(Number(m[2].replace(/\./g, '').replace(',', '.')) * 100);
  const refund = /erstattung|gutschrift|rückerstattung/i.test(text) || m[1] === '+';
  const method = /(visa|mastercard|american express|amex|lastschrift|kreditkarte|girocard|paypal|geschenkgutschein)(?:\s*[*•·]+\s*\d{2,4})?/i.exec(text)?.[0].replace(/\s+/g, ' ').trim() || '';
  return { orderId: id, date: germanDate(date || text), cents: refund ? cents : -cents, method };
}

/** Rows without date or amount are dropped; the same charge listed twice (same order, day, amount) counts once. */
function parsePayments(rows) {
  const seen = new Set(); const out = [];
  for (const r of rows) {
    const p = parsePayment(r);
    if (!p || !p.date) continue;
    const key = [p.orderId, p.date, p.cents, p.method].join('|');
    if (!seen.has(key)) { seen.add(key); out.push(p); }
  }
  return out;
}

/** Product links of an order page: title and a clean link to the product (/dp/ASIN). */
function parseItems(links) {
  const out = new Map();
  for (const { text, href } of links) {
    const asin = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(href || '')?.[1];
    const title = String(text || '').replace(/\s+/g, ' ').trim();
    if (!asin || title.length < 3 || /^(artikel ansehen|erneut kaufen|bewertung|produktsupport)/i.test(title)) continue;
    if (!out.has(asin) || out.get(asin).title.length < title.length) out.set(asin, { asin, title: title.slice(0, 300), url: `https://www.amazon.de/dp/${asin}` });
  }
  return [...out.values()];
}

module.exports = { parseCard, parseCards, parsePayment, parsePayments, parseItems, germanDate, euroCents, ORDER_ID };
