'use strict';
/**
 * Regression 22.11.2026: a Signal Iduna PDF held the statements of two sub-accounts of one flat (main loan "…-00" and a
 * small loan "…-01"). The parser took the first "IBAN für dieses Konto" and gave it every balance of the file, so the
 * small loan's balance replaced the main loan's (the flat showed ~370.000 € too little debt). Each part is read alone.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAll } = require('../lib/loan-statements');

const part = (iban, amount, from, to) => `IBAN für dieses Konto\n${iban}\nKundennummer Darlehensart Ursprüngliche Darlehenshöhe in EUR Seite\n1234 567-89 | Gebäudedarlehen ${amount} 1 von 1\nAlter Kontostand in EUR am 31.12.2023 ${from} -\nZinsen 31.01.2024 120,00 -\nNeuer Kontostand in EUR am 31.12.2024 ${to} -\n`;

test('one PDF with two sub-account statements gives two accounts with their own balances', () => {
  const text = `Kontoauszug 2024\n${part('DE00 1234 5678 0000 3333 00', '300.000,00', '290.000,00', '285.000,00')}${part('DE00 1234 5678 0000 3333 01', '20.000,00', '12.000,00', '10.000,00')}`;
  const got = parseAll(text).map((p) => ({ ref: p.ref, amount: p.amount, balances: p.balances.map((b) => `${b.on}=${b.cents}`) }));
  assert.deepEqual(got, [
    { ref: '333300', amount: 30000000, balances: ['2023-12-31=29000000', '2024-12-31=28500000'] },
    { ref: '333301', amount: 2000000, balances: ['2023-12-31=1200000', '2024-12-31=1000000'] },
  ]);
});

test('a single statement is read as before', () => {
  assert.equal(parseAll(part('DE00 1234 5678 0000 3333 00', '300.000,00', '290.000,00', '285.000,00')).length, 1);
  assert.deepEqual(parseAll('kein Auszug'), []);
});

test('OCR noise: characters between label and IBAN, a stray dot after "am", an amount without thousands dot', () => {
  const ocr = 'Kontoauszug 2023\n= IBAN für dieses Konto :\n2 DE00 1234 5678 0000 4444 00\n| 1234 567-00 | Gebäudedarlehen 300.000,00 1 von 1\n| Alter Kontostand in EUR am 31.12.2022 290.000,00 -\n3 Lastschrifteinzug 29.12.2023 31.12.2023 900,00 +\n7 Neuer Kontostand in EUR am . 31.12.2023 286500,50 -\n';
  assert.deepEqual(parseAll(ocr).map((p) => ({ ref: p.ref, balances: p.balances.map((b) => `${b.on}=${b.cents}`) })), [{ ref: '444400', balances: ['2022-12-31=29000000', '2023-12-31=28650050'] }]);
});
