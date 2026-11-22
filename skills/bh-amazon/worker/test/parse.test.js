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

test('payment rows in the format of the real page (Nov 2026): English amount, own date, bank as method', () => {
  const p = parsePayment({ date: '02. November 2026', text: '25. Oktober 2026·Amazon.de COMMERZBANK AG (FORMERLY COMDIRECT BANK AG)•••400 Bestellnummer 302-1111111-2222222 -€12.74 Berechnet' });
  assert.deepEqual(p, { orderId: '302-1111111-2222222', date: '2026-10-25', cents: -1274, method: 'COMMERZBANK AG (FORMERLY COMDIRECT BANK AG)•••400' });
  assert.equal(parsePayment({ text: '3. März 2025·Amazon.de Visa •••1234 Bestellnummer 028-3333333-4444444 +€1,234.50 Erstattet' }).cents, 123450);
  assert.equal(parsePayment({ text: '3. März 2025·Amazon.de Lastschrift Bestellnummer 028-3333333-4444444 -1.234,50 €' }).cents, -123450);
});

test('order cards as on the history page: digital orders, English totals, items with product links', () => {
  const o = parseCards([{ text: 'Bestellung aufgegeben 3. Februar 2025 Summe €23.98 Bestellnr. D01-1234567-7654321', products: [{ text: '', href: '/dp/B0ABCDEF12' }, { text: 'Hörbuch: Der kleine Drache', href: '/gp/product/B0ABCDEF12?ref=x' }] }])[0];
  assert.deepEqual(o, { id: 'D01-1234567-7654321', date: '2025-02-03', totalCents: 2398, items: [{ asin: 'B0ABCDEF12', title: 'Hörbuch: Der kleine Drache', url: 'https://www.amazon.de/dp/B0ABCDEF12' }] });
});

test('digital orders (22.11.2026): Prime Video detail links and the order page links (ppx_hzod) count as items', () => {
  const items = parseItems([
    { text: 'The Complete Matrix Trilogy (3pk)', href: '/gp/video/detail/amzn1.dv.gti.73d0b76f-bcf8-4dce-96ed-2b5cfd000000?ref_=x' },
    { text: '', href: '/gp/video/detail/amzn1.dv.gti.73d0b76f-bcf8-4dce-96ed-2b5cfd000000' },
    { text: 'Prime Membership Fee', href: '/dp/B078T13L9H?ref_=ppx_hzod_title_dt_b_fed_digi_asin_title_' },
  ]);
  assert.deepEqual(items.map((i) => [i.title, i.url]), [
    ['The Complete Matrix Trilogy (3pk)', 'https://www.amazon.de/gp/video/detail/amzn1.dv.gti.73d0b76f-bcf8-4dce-96ed-2b5cfd000000'],
    ['Prime Membership Fee', 'https://www.amazon.de/dp/B078T13L9H'],
  ]);
});
