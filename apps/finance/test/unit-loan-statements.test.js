'use strict';
/** Loan statements: balances and rate read from the bank's statement text; today's balance = last statement − repayment since. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-stmt-'));
const { getDb } = require('../lib/db');
const loans = require('../lib/loans');
const st = require('../lib/loan-statements');
const IBAN = 'DE00123456780001234567'; // made up, account number 1234567
const text = (from, to, rate = '2,15000') => `EUR-Konto       Kontonummer 0001234567
Kontoauszug    Nr.  2/2024
alter Kontostand vom ${from[0]}      ${from[1]} S
31.07. 31.07. Darlehen PN:100     310,00 H
${rate}% Sollzins       3107      108,20S
neuer Kontostand vom ${to[0]}      ${to[1]} S`;

test('parse: account, both balances as debt, rate; other papers give null', () => {
  assert.deepEqual(st.parse(text(['28.06.2024', '61.234,50'], ['30.12.2024', '60.111,20'])), { ref: '1234567', balances: [{ on: '2024-06-28', cents: 6123450 }, { on: '2024-12-30', cents: 6011120 }], rate: 2.15, amount: null });
  assert.equal(st.parse('Zinsbescheinigung für 2024'), null);
});

test('parse: PSD statement (Sollzinsen, Festzinssatz) and NordLB year statement (negative balance means debt)', () => {
  const psd = `EUR-Konto Kontonummer 7000000001\nHerrn und Frau Ursprungsdarlehen 50.000,00\nnomin.Festzinssatz bis 30.04.2035 p.a. 2,75 %\nalter Kontostand vom 30.12.2022 40.000,00 S\n31.01. 31.01. Darlehenstilgung 150,00 H\nneuer Kontostand vom 30.12.2023 38.200,00 S`;
  assert.deepEqual(st.parse(psd), { ref: '7000000001', balances: [{ on: '2022-12-30', cents: 4000000 }, { on: '2023-12-30', cents: 3820000 }], rate: 2.75, amount: 5000000 });
  const nord = `Jahreskontoauszug für den Zeitraum 01.01.2025 - 31.12.2025 Seite 1 von 2\nDarlehen 0800000002, DE00 1234 5678 0800 0000 02, Musterstadt\nKontostand am 01.01.2025 -300.000,00\n31.01.2025 Darlehenszins / Wert: 31.01.2025 -700,00\nKontostand am 31.12.2025 -295.500,00`;
  assert.deepEqual(st.parse(nord), { ref: '800000002', balances: [{ on: '2025-01-01', cents: 30000000 }, { on: '2025-12-31', cents: 29550000 }], rate: null, amount: null, place: 'Musterstadt' });
});

test('import keeps only known loans; overview: balance today from the last statement minus repayment since', () => {
  loans.importSheet({ asOf: '2026-11-15', units: [{ address: '1, Musterstadt, Musterweg 1', unit: 'WE 01', market_value: 200000, loans: [{ position: 1, amount: 120000, balance: 99999, annuity: 310, lender: 'Bank', account: IBAN }] }] });
  const refs = new Set(['1234567']);
  const r = st.importStatements({ statements: [
    { name: 'a.pdf', text: text(['29.12.2023', '62.345,60'], ['28.06.2024', '61.234,50']) },
    { name: 'b.pdf', text: text(['28.06.2024', '61.234,50'], ['30.12.2024', '60.111,20']) },
    { name: 'other.pdf', text: text(['01.01.2024', '1,00'], ['30.06.2024', '2,00']).replace('0001234567', '0009999999') },
  ], docs: [{ ref: '1234567', url: 'https://drive.google.com/drive/folders/x' }, { ref: '1234567', url: 'javascript:alert(1)' }] }, refs);
  assert.deepEqual(r, { balances: 4, skipped: 1 }, 'the shared middle balance is stored once and updated, a foreign account is skipped');
  const db = getDb(); let n = 0;
  const pay = (day, z, ti) => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('BBB', day, -31000, `Teilzahlung Darlehen IBAN ${IBAN}RECHN.ZINS ${z} TILG./ENTG. ${ti} TILGUNG PER ${day}`, 'Bank', `s${n += 1}`, 'x');
  pay('2024-12-30', '109,00', '201,00'); // already in the statement balance
  pay('2025-01-31', '108,60', '201,40');
  pay('2025-02-28', '108,20', '201,80');
  const l = loans.overview().loans[0];
  assert.equal(l.rate_pct, 2.15); assert.equal(l.docs_url, 'https://drive.google.com/drive/folders/x', 'only drive links are kept');
  assert.deepEqual(l.bank_balance, { on: '2024-12-30', cents: 6011120 });
  assert.equal(l.balance_now_cents, 6011120 - 20140 - 20180);
  assert.equal(l.history.length, 3);
  assert.equal(loans.overview().totals.balance, l.balance_now_cents, 'totals use today\'s balance');
  assert.equal(loans.estate().units[0].balance_cents, l.balance_now_cents, 'the Immobilien module shows the same balance');
});

test('a statement of an account the sheet lacks goes to the only loan of the same bank without account in that flat folder', () => {
  const links = require('../lib/estate-links');
  loans.importSheet({ units: [
    { address: '2, Beispielort, Am Park 8', unit: 'WE 10', market_value: 1, loans: [{ position: 1, amount: 300000, balance: 1, lender: 'NordLB', account: 'DE00250500000800000002' }, { position: 2, amount: 50000, balance: 1, lender: 'NordLB' }, { position: 3, amount: 10000, balance: 1, lender: 'Andere Bank' }] },
    { address: '3, Beispielort, Lindenweg 2', unit: 'WE 30', market_value: 1, loans: [{ position: 1, amount: 1, balance: 1, lender: 'NordLB' }, { position: 2, amount: 1, balance: 1, lender: 'NordLB' }] },
  ] });
  links.importLinks({ folders: [{ name: '2, Beispielort, Am Park 8, WE 10', id: 'folderAmPark0010' }, { name: '3, Beispielort, Lindenweg 2, WE 30', id: 'folderLinden0030' }] });
  const nord = (no, from, to) => `Darlehen ${no}, DE00\nKontostand am 01.01.2025 -${from}\nKontostand am 31.12.2025 -${to}`;
  const refs = new Set(['800000002']);
  const r = st.importStatements({ statements: [
    { text: nord('0800000002', '300.000,00', '295.000,00'), folderId: 'folderAmPark0010' },
    { text: nord('0800000009', '50.000,00', '48.000,00'), folderId: 'folderAmPark0010' },
    { text: nord('0800000007', '1,00', '1,00'), folderId: 'folderLinden0030' },
  ] }, refs);
  assert.deepEqual(r, { balances: 4, skipped: 1 }, 'the second NordLB loan gets its account; in a folder without a known loan nothing is guessed');
  const second = loans.overview().loans.find((l) => l.unit === 'WE 10' && l.position === 2);
  assert.equal(second.ref, '800000009'); assert.equal(second.balance_now_cents, 4800000);
  loans.importSheet({ units: [{ address: '2, Beispielort, Am Park 8', unit: 'WE 10', market_value: 1, loans: [{ position: 1, amount: 1, balance: 1, lender: 'NordLB', account: 'DE00250500000800000002' }, { position: 2, amount: 1, balance: 1, lender: 'NordLB' }] }] });
  assert.equal(loans.overview().loans.find((l) => l.position === 2).ref, '800000009', 'the found account survives a new sheet import');
});

test('without a flat folder the place decides: a tax folder path, else the address in the statement header', () => {
  const links = require('../lib/estate-links');
  loans.importSheet({ units: [
    { address: '4, Beispielort, Birkenweg 7', unit: 'WE 05', market_value: 1, loans: [{ position: 1, amount: 1, balance: 1, lender: 'NordLB', account: 'DE00250500000900000001' }, { position: 2, amount: 1, balance: 1, lender: 'NordLB' }] },
    { address: '5, Beispielort, Eichenweg 3', unit: 'WE 01', market_value: 1, loans: [{ position: 1, amount: 1, balance: 1, lender: 'PSD', account: 'DE00100900007000000021' }, { position: 2, amount: 1, balance: 1, lender: 'PSD' }] },
  ] });
  assert.deepEqual(links.unitsFor('#_Leads / 14055, Berlin, Andere Allee 4, WE 02'), []);
  assert.deepEqual(links.unitsFor('Beispielort, Birkenweg 7,1'), ['4, Beispielort, Birkenweg 7 – WE 05']);
  assert.deepEqual(links.unitsFor('Birkenweg 70'), [], 'number 7 is not 70');
  const nord = (no) => `Darlehen ${no}, DE00 2505 0000 ${no.slice(0, 4)} 0000 01, Beispielort, Birkenweg 7,1\nKontostand am 01.01.2025 -10.000,00\nKontostand am 31.12.2025 -9.000,00`;
  const psd = (no) => `EUR-Konto Kontonummer ${no}\nalter Kontostand vom 30.12.2022 5.000,00 S\nneuer Kontostand vom 30.12.2023 4.000,00 S`;
  const refs = new Set(['900000001', '7000000021']);
  st.importStatements({ statements: [
    { text: nord('0900000001'), folderId: 'leadFolder000001' }, { text: nord('0900000002'), folderId: 'leadFolder000001' },
    { text: psd('7000000021'), place: '2024 / 02_AnlageV / 03_BESTAND_5, Beispielort, Eichenweg 3, EG' }, { text: psd('7000000022'), place: '2024 / 02_AnlageV / 03_BESTAND_5, Beispielort, Eichenweg 3, EG' },
  ] }, refs);
  const o = loans.overview().loans;
  assert.equal(o.find((l) => l.lender === 'NordLB' && l.position === 2).ref, '900000002', 'header address, though the file lies in a lead folder');
  assert.equal(o.find((l) => l.lender === 'PSD' && l.position === 2).ref, '7000000022', 'tax folder path');
});

test('Signal Iduna statements, OCR typos and the original amount telling two loans of one bank apart', () => {
  const si = (iban, amount, from, to) => `Kontoauszug 2024\nIBAN für dieses Konto\n${iban}\nKundennummer Darlehensart Ursprüngliche Darlehenshöhe in EUR Seite\n1234 567-89 | Gebäudedarlehen ${amount} 1 von 1\nAlter Kontostand in EUR am 31.12.2023 ${from} -\nZinsen 31.01.2024 120,00 -\nNeuer Kontostand in EUR am 31.12.2024 ${to} -`;
  assert.deepEqual(st.parse(si('DE00 1234 5678 0000 1111 01', '40.000,00', '30.000,00', '28.500,00')), { ref: '111101', balances: [{ on: '2023-12-31', cents: 3000000 }, { on: '2024-12-31', cents: 2850000 }], rate: null, amount: 4000000 });
  const ocr = 'Jahreskontoauszug fiir den Zeitraum\nDarlehen 0700000005, Wohn-A-1 ETWen Musterstadt\nN Bewilligtes Darlehen EUR: 200.000,00 RateEUR: 900,00\nx Kontöstand am 01.01.2024 -180.000,00\nKontostand am 31.12.2024 -176.000,00';
  assert.deepEqual(st.parse(ocr).balances.map((b) => b.cents), [18000000, 17600000]); assert.equal(st.parse(ocr).amount, 20000000);
  const links = require('../lib/estate-links');
  loans.importSheet({ units: [{ address: '6, Beispielort, Gartenstraße 12', unit: 'WE 22', market_value: 1, loans: [
    { position: 1, amount: 100000, balance: 1, lender: 'Signal Iduna', account: 'DE00123456780000222201' },
    { position: 2, amount: 40000, balance: 1, lender: 'Signal Iduna' }, { position: 3, amount: 5000, balance: 1, lender: 'Signal Iduna' }] }] });
  assert.deepEqual(links.unitsFor('Beispielort,Gartenstr.12 WE22'), ['6, Beispielort, Gartenstraße 12 – WE 22'], 'abbreviated street, glued number');
  const place = '2024 / 02_AnlageV / 02_BESTAND_6, Beispielort, Gartenstraße 12';
  st.importStatements({ statements: [
    { text: si('DE00 1234 5678 0000 2222 01', '100.000,00', '90.000,00', '88.000,00'), place },
    { text: si('DE00 1234 5678 0000 1111 01', '40.000,00', '30.000,00', '28.500,00'), place },
    { text: si('DE00 1234 5678 0000 3333 01', '7.000,00', '3.000,00', '2.000,00'), place },
  ] }, new Set(['222201']));
  const o = loans.overview().loans;
  assert.equal(o.find((l) => l.position === 2).ref, '111101', 'the amount picks the right one of two candidates');
  assert.equal(o.find((l) => l.position === 3).ref, '', 'no amount match: nothing is guessed');
});

test('one loan account for two flats is split by the sheet balances, not counted twice', () => {
  loans.importSheet({ units: [
    { address: '7, Beispielort, Hafenstraße 1', unit: 'WE 05', market_value: 1, loans: [{ position: 1, amount: 100000, balance: 75000, lender: 'Sparkasse', account: 'DE00870540000700000055' }] },
    { address: '7, Beispielort, Seestraße 3', unit: 'WE 27', market_value: 1, loans: [{ position: 1, amount: 300000, balance: 225000, lender: 'Sparkasse', account: 'DE00870540000700000055' }] },
  ] });
  st.importStatements({ statements: [{ text: 'Darlehen 0700000055, Musterstadt\nKontostand am 01.01.2024 -320.000,00\nKontostand am 31.12.2024 -280.000,00' }] }, new Set(['700000055']));
  const o = loans.overview();
  assert.deepEqual(o.loans.map((l) => l.balance_now_cents).sort((a, b) => a - b), [7000000, 21000000]);
  assert.equal(o.totals.balance, 28000000, 'the bank balance is counted once');
  assert.equal(o.loans[0].shared, 2);
});

test('regression 16.11.2026: account at the wrong one of two loans of one bank for two flats; an empty sheet slot is no loan', () => {
  const links = require('../lib/estate-links');
  loans.importSheet({ units: [
    { address: '8, Beispielort, Ulmenstraße 20, WE 30', unit: 'WE 30', market_value: 1, loans: [
      { position: 1, amount: 150000, balance: 1, lender: 'NordLB', account: 'DE00250500000600001111' }, { position: 2, amount: 300000, balance: 1, lender: 'NordLB' }] },
    { address: '8, Beispielort, Ulmenstraße 20, WE 31', unit: 'WE 31', market_value: 1, loans: [{ position: 1, amount: 0, balance: 0, lender: '' }] },
  ] });
  const nord = (no, granted, to) => `Darlehen ${no}, DE00, Beispielort,Ulmenstr.20 WE30,31\nBewilligtes Darlehen EUR: ${granted} Rate EUR: 1,00\nKontostand am 01.01.2025 -0,00\nKontostand am 31.12.2025 -${to}`;
  st.importStatements({ statements: [{ text: nord('0600001111', '300.000,00', '300.000,00') }, { text: nord('0600002222', '150.000,00', '150.000,00') }] }, new Set(['600001111']));
  const o = loans.overview().loans;
  assert.equal(o.find((l) => l.amount_cents === 30000000).ref, '600001111', 'the bank amount moves the account to the larger loan');
  assert.equal(o.find((l) => l.amount_cents === 15000000).ref, '600002222', 'the smaller loan gets the other account');
  assert.equal(o.length, 2, 'the empty slot of WE 31 is no loan');
  assert.equal(loans.estate().units.find((u) => u.unit === 'WE 31').loans, 0);
  loans.importSheet({ units: [{ address: '8, Beispielort, Ulmenstraße 20, WE 30', unit: 'WE 30', market_value: 1, loans: [
    { position: 1, amount: 150000, balance: 1, lender: 'NordLB', account: 'DE00250500000600001111' }, { position: 2, amount: 300000, balance: 1, lender: 'NordLB' }] }] });
  assert.equal(loans.overview().loans.find((l) => l.position === 1).ref, '600002222', 'the correction survives a new sheet import');
});

