'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-'));
const { getDb } = require('../lib/db');
const { parseBankFile } = require('../lib/importers');
const { toCents, toDay } = require('../lib/money');
const { extract, normalize } = require('../lib/counterparty');
const ledger = require('../lib/ledger');
const categorize = require('../lib/categorize');
const report = require('../lib/report');

function seed() {
  const ins = getDb().prepare('INSERT OR IGNORE INTO categories (code, art, name, budget_cents) VALUES (?, ?, ?, ?)');
  [['LOHN', 'Einnahmen', 'Gehalt', null], ['LEBEN', 'Ausgaben', 'Lebensmittel', 60000], ['AKTIEN', 'Investment', 'Aktien und ETF', null], ['SPAR', 'Rücklagen', 'Sparen', null]].forEach((c) => ins.run(...c));
}
seed();

test('money: German and plain numbers, dates', () => {
  assert.equal(toCents('-1.234,56'), -123456); assert.equal(toCents('12.5'), 1250); assert.equal(toCents(-7.1), -710); assert.equal(toCents(''), null);
  assert.equal(toDay('02.01.2024'), '2024-01-02'); assert.equal(toDay('2.1.24'), '2024-01-02'); assert.equal(toDay('2024-03-04'), '2024-03-04'); assert.equal(toDay('gestern'), null);
});

test('counterparty: from comdirect texts and normalised', () => {
  assert.equal(extract('Auftraggeber: REWE Markt GmbH Buchungstext: Einkauf 12.01.'), 'REWE Markt GmbH');
  assert.equal(extract('Empfänger: Scalable Capital Kto/IBAN: DE12 Buchungstext: Sparplan'), 'Scalable Capital');
  assert.equal(normalize('REWE Markt GmbH'), normalize('rewe markt'));
});

test('importers: comdirect with preamble and latin1, BBBank, PayPal, unknown format', () => {
  const comdirect = Buffer.from('"Umsätze Girokonto";"Zeitraum: 30 Tage";\n\n"Buchungstag";"Wertstellung (Valuta)";"Vorgang";"Buchungstext";"Umsatz in EUR";\n"02.01.2024";"02.01.2024";"Lastschrift / Belastung";"Auftraggeber: Bäckerei Buchungstext: Brötchen";"-3,20";\n"Alter Kontostand";"1.000,00 EUR";\n', 'latin1');
  const c = parseBankFile(comdirect);
  assert.equal(c.format, 'comdirect'); assert.equal(c.rows.length, 1); assert.equal(c.rows[0].cents, -320); assert.equal(c.rows[0].counterparty, 'Bäckerei');
  const bb = parseBankFile(Buffer.from('Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag\n05.01.2024;05.01.2024;Arbeitgeber AG;DE00;Lohn/Gehalt/Rente;Gehalt Januar;3.000,00\n'));
  assert.equal(bb.account, 'BBBank', 'the bank name unless the settings give an own name'); assert.equal(bb.rows[0].counterparty, 'Arbeitgeber AG'); assert.equal(bb.rows[0].cents, 300000);
  const pp = parseBankFile(Buffer.from('"Datum","Uhrzeit","Name","Beschreibung","Brutto"\n"07.01.2024","10:00","Shop","Website-Zahlung","-19,99"\n"07.01.2024","10:00","Max","Bankgutschrift auf PayPal-Konto","19,99"\n'));
  assert.equal(pp.rows.length, 1, 'PayPal top-ups are skipped, the bank account already holds them');
  assert.equal(pp.format, 'paypal'); assert.equal(pp.rows[0].cents, -1999);
  assert.throws(() => parseBankFile(Buffer.from('a;b;c\n1;2;3\n')), /Format nicht erkannt/);
  assert.equal(parseBankFile(comdirect, 'Karte').account, 'Karte');
});

test('ledger: duplicates skipped, equal lines in one file kept, categories learned after two signals', () => {
  const row = (text, cents, date = '2024-02-01') => ({ date, cents, kind: 'Lastschrift', text, counterparty: extract(text) });
  const first = ledger.importRows({ filename: 'a.csv', format: 'comdirect', account: 'comdirect', rows: [row('Auftraggeber: REWE Buchungstext: x', -500), row('Auftraggeber: REWE Buchungstext: x', -500)], user: 't' });
  assert.deepEqual(first, { added: 2, duplicates: 0 });
  assert.deepEqual(ledger.importRows({ filename: 'b.csv', format: 'comdirect', account: 'comdirect', rows: [row('Auftraggeber: REWE Buchungstext: x', -500)], user: 't' }), { added: 0, duplicates: 1 });
  const ids = getDb().prepare("SELECT id FROM transactions WHERE counterparty = 'REWE'").all().map((r) => r.id);
  const one = ledger.setCategory(ids[0], 'LEBEN');
  assert.equal(one.applied, 0, 'one signal is not enough');
  assert.equal(getDb().prepare('SELECT suggestion FROM transactions WHERE id = ?').get(ids[1]).suggestion, 'LEBEN');
  ledger.setCategory(ids[1], 'LEBEN');
  const later = ledger.importRows({ filename: 'c.csv', format: 'comdirect', account: 'comdirect', rows: [row('Auftraggeber: REWE Buchungstext: y', -800, '2024-03-01')], user: 't' });
  assert.equal(later.added, 1);
  assert.equal(getDb().prepare("SELECT category, category_source FROM transactions WHERE booked_on = '2024-03-01'").get().category_source, 'rule');
  assert.throws(() => ledger.setCategory(ids[0], 'GIBTSNICHT'), /Unbekannte Kategorie/);
});

test('ledger: a partner booked two ways is never applied automatically', () => {
  categorize.learn('Mischladen', 'LEBEN'); categorize.learn('Mischladen', 'LEBEN'); categorize.learn('Mischladen', 'SPAR');
  assert.equal(categorize.suggest('Mischladen').sure, false);
});

test('report: kinds, totals, savings rate, previous year, investments over the years', () => {
  const rows = [
    { date: '2024-01-31', cents: 300000, text: 'Auftraggeber: Arbeitgeber Buchungstext: Lohn', category: 'LOHN' },
    { date: '2024-01-15', cents: -50000, text: 'Empfänger: Broker Buchungstext: ETF', category: 'AKTIEN' },
    { date: '2024-02-15', cents: -50000, text: 'Empfänger: Broker Buchungstext: ETF Feb', category: 'AKTIEN' },
    { date: '2023-05-15', cents: -20000, text: 'Empfänger: Broker Buchungstext: ETF alt', category: 'AKTIEN' },
    { date: '2024-04-02', cents: -999, text: 'Empfänger: Unbekannt Buchungstext: ?', category: null },
  ].map((r) => ({ ...r, counterparty: extract(r.text) }));
  ledger.importRows({ filename: 'sheet', format: 'sheet', account: 'comdirect', rows, user: 't', keepCategories: true });
  const o = report.overview(2024);
  assert.equal(o.totals.income, 300000); assert.equal(o.totals.invested, 100000);
  assert.ok(o.totals.savingsRate > 30);
  const aktien = o.categories.find((c) => c.code === 'AKTIEN');
  assert.equal(aktien.months[0], -50000); assert.equal(aktien.previous, -20000);
  assert.ok(o.categories.find((c) => c.code === 'OFFEN'), 'open transactions are shown as their own line');
  const inv = report.investments(2024);
  assert.equal(inv.total, 100000); assert.equal(inv.months[1], 50000); assert.equal(inv.targets[0].counterparty, 'Broker'); assert.equal(inv.targets[0].art, 'Investment');
  ledger.importRows({ filename: 'k', format: 'sheet', account: 'comdirect', rows: [{ date: '2024-06-01', cents: -2500, text: 'Empfänger: Kinderdepot Buchungstext: Sparen', counterparty: 'Kinderdepot', category: 'SPAR' }], user: 't', keepCategories: true });
  assert.equal(report.investments(2024).total, 102500, 'reserves count as wealth building');
  assert.deepEqual(inv.perYear.map((p) => p.cumulative), [20000, 120000]);
  assert.deepEqual(report.years(), [2024, 2023]);
});

test('bundle: the shared finance helpers load before the pages that use them', () => {
  const { APP_JS } = require('../lib/assets');
  const base = APP_JS.indexOf('window.Fin = ');
  for (const page of ['window.FinOverview', 'window.FinTransactions', 'window.FinInvestments', 'window.FinImport', 'window.FinCategories']) assert.ok(base >= 0 && base < APP_JS.indexOf(page), page);
});
