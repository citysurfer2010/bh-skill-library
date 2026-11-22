'use strict';
/**
 * Reads Amazon order cards from their visible text, not from page structure: Amazon changes its markup often,
 * the words "Bestellung aufgegeben", "Summe" and the order number pattern stay. Pure functions, tested with sample text.
 */
// Physical orders 302-…, digital ones (Prime Video, Kindle) D01-….
const ORDER_ID = /\b([0-9D]\d{2}-\d{7}-\d{7})\b/;
/** A whole order number: physical "302-…" or digital "D01-…" (22.11.2026: the items endpoint let only physical ones through). */
const isOrderId = (x) => /^[0-9D]\d{2}-\d{7}-\d{7}$/.test(String(x || ''));
const MONTHS = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };

/** "3. Februar 2025" → "2025-02-03" */
function germanDate(text) {
  const m = /(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})/.exec(text || '');
  const month = m && MONTHS[m[2].toLowerCase()];
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** "12,34 €", "€ 12,34", "1.234,56 €" → cents */
function euroCents(text) {
  const m = /€\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?!\d)/.exec(text || '') || /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€/.exec(text || '');
  return m ? Math.round(Number(m[1].replace(/[.,](?=\d{3}(?:[.,]|$))/g, '').replace(',', '.')) * 100) : null;
}

/** One card: its full text plus the texts of its product links. */
function parseCard({ text, products = [] }) {
  const id = ORDER_ID.exec(text || '')?.[1];
  if (!id) return null;
  const after = (label) => { const i = text.search(label); return i < 0 ? '' : text.slice(i, i + 80); };
  // products: plain titles (older callers) or { text, href } links of the card, which give the product page too.
  const links = products.map((p) => (typeof p === 'string' ? { text: p, href: '' } : p));
  const withAsin = parseItems(links);
  const titles = [...new Set(links.map((p) => String(p.text || '').replace(/\s+/g, ' ').trim()).filter((p) => p.length > 2 && !/^(artikel ansehen|erneut kaufen|produktsupport|bewertung|rücksendung|lieferung verfolgen)/i.test(p)))];
  const items = withAsin.length ? withAsin : titles.map((title) => ({ asin: '', title, url: '' }));
  const card = { id, date: germanDate(after(/Bestellung aufgegeben|Bestelldatum/i)), totalCents: euroCents(after(/Summe|Gesamtbetrag/i)), items: items.slice(0, 20) };
  return products.length && typeof products[0] === 'string' ? { ...card, items: card.items.map((i) => i.title) } : card;
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
  // Amazon writes "-€12.74" (English) as well as "-12,74 €" (German); the separator before the last two digits is the decimal one.
  const m = /([-+−]?)\s*€\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?!\d)/.exec(text || '') || /([-+−]?)\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€/.exec(text || '');
  if (!id || !m) return null;
  const digits = m[2].replace(/[.,](?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
  const cents = Math.round(Number(digits) * 100);
  const refund = /erstattet|erstattung|gutschrift|rückerstattung|refund/i.test(text) || m[1] === '+';
  // "25. Oktober 2026·Amazon.de COMMERZBANK AG (FORMERLY COMDIRECT BANK AG)•••400 Bestellnummer …": the row's own date wins over the heading above it.
  const method = (/(?:amazon\.de|amazon\s+marketplace|amazon)\s+(.+?)\s*Bestellnummer/i.exec(text || '')?.[1] || /(visa|mastercard|american express|amex|lastschrift|kreditkarte|girocard|paypal|geschenkgutschein)(?:\s*[*•·]+\s*\d{2,4})?/i.exec(text || '')?.[0] || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return { orderId: id, date: germanDate(text) || germanDate(date), cents: refund ? cents : -cents, method };
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

/**
 * Product links of an order page: title and a clean link to the product (/dp/ASIN). Prime Video titles link to
 * /gp/video/detail/<ASIN or amzn1.dv.gti.…> instead (22.11.2026: 51 digital orders had no items because of that).
 */
const VIDEO = /\/gp\/video\/detail\/(amzn1\.dv\.gti\.[0-9a-f-]{20,40}|[A-Z0-9]{10})/;
function parseItems(links) {
  const out = new Map();
  for (const { text, href } of links) {
    const video = VIDEO.exec(href || '')?.[1];
    const asin = video || /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(href || '')?.[1];
    const title = String(text || '').replace(/\s+/g, ' ').trim();
    if (!asin || title.length < 3 || /^(artikel ansehen|erneut kaufen|bewertung|produktsupport)/i.test(title)) continue;
    const url = video ? `https://www.amazon.de/gp/video/detail/${asin}` : `https://www.amazon.de/dp/${asin}`;
    if (!out.has(asin) || out.get(asin).title.length < title.length) out.set(asin, { asin, title: title.slice(0, 300), url });
  }
  return [...out.values()];
}

module.exports = { parseCard, parseCards, parsePayment, parsePayments, parseItems, germanDate, euroCents, ORDER_ID, isOrderId };
