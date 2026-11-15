'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCard, parseCards, germanDate, euroCents } = require('../lib/parse');

test('German dates and euro amounts', () => {
  assert.equal(germanDate('Bestellung aufgegeben 3. Februar 2025'), '2025-02-03');
  assert.equal(germanDate('am 12. März 2024'), '2024-03-12');
  assert.equal(germanDate('gestern'), null);
  assert.equal(euroCents('Summe 1.234,56 €'), 123456); assert.equal(euroCents('Summe € 9,99'), 999); assert.equal(euroCents('kostenlos'), null);
});

test('a card: id, date, total, product names without action links', () => {
  const o = parseCard({ text: 'Bestellung aufgegeben 3. Februar 2025 Summe 23,98 € Lieferung an Matti Bestellnr. 302-1234567-7654321 Details anzeigen', products: ['USB-C Kabel 2 m', 'Erneut kaufen', 'USB-C Kabel 2 m', 'Kinderbuch: Der kleine Drache'] });
  assert.deepEqual(o, { id: '302-1234567-7654321', date: '2025-02-03', totalCents: 2398, items: ['USB-C Kabel 2 m', 'Kinderbuch: Der kleine Drache'] });
  assert.equal(parseCard({ text: 'Keine Bestellnummer hier' }), null);
});

test('several cards: duplicates of one order are merged into the first', () => {
  const out = parseCards([{ text: 'Bestellnr. 028-1111111-2222222 Bestellung aufgegeben 1. Mai 2024 Summe 5,00 €' }, { text: 'Bestellnr. 028-1111111-2222222' }, { text: 'Werbung' }]);
  assert.equal(out.length, 1); assert.equal(out[0].date, '2024-05-01');
});

const { parsePayment, parsePayments, parseItems } = require('../lib/parse');
test('payment rows: charge negative, refund positive, method, date from the heading', () => {
  assert.deepEqual(parsePayment({ date: '14. November 2026', text: 'Visa ****1234 AMAZON.DE Bestellnummer 302-1234567-7654321 -23,98 €' }),
    { orderId: '302-1234567-7654321', date: '2026-11-14', cents: -2398, method: 'Visa ****1234' });
  assert.equal(parsePayment({ date: '1. März 2025', text: 'Erstattung Lastschrift Bestellnummer 028-1111111-2222222 +5,00 €' }).cents, 500);
  assert.equal(parsePayment({ date: '1. März 2025', text: 'ohne Bestellnummer -5,00 €' }), null);
  const rows = parsePayments([{ date: '2. Mai 2025', text: 'Lastschrift Bestellnummer 302-1-x' }, { date: '2. Mai 2025', text: 'Lastschrift Bestellnummer 302-0000000-0000001 -1.234,50 €' }, { date: '2. Mai 2025', text: 'Lastschrift Bestellnummer 302-0000000-0000001 -1.234,50 €' }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].cents, -123450);
});

test('order page items: ASIN links, longest title wins, action links dropped', () => {
  const items = parseItems([{ text: 'USB-C', href: '/dp/B0ABCDEF12?ref=x' }, { text: 'USB-C Kabel 2 m, geflochten', href: 'https://www.amazon.de/gp/product/B0ABCDEF12' }, { text: 'Erneut kaufen', href: '/dp/B0ZZZZZZZZ' }, { text: 'Hilfe', href: '/help' }]);
  assert.deepEqual(items, [{ asin: 'B0ABCDEF12', title: 'USB-C Kabel 2 m, geflochten', url: 'https://www.amazon.de/dp/B0ABCDEF12' }]);
});
