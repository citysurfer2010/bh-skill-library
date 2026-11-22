'use strict';
/** Depot export (22.11.2026): positions, value = price × quantity, total as a point on the page "Vermögen". Invented data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-depot-'));
const { getDb } = require('../lib/db');
getDb();
const depot = require('../lib/depot');
const wealth = require('../lib/wealth');

const HEAD = ['Datum der Erstellung', 'Depotnummer', 'Wertpapierbezeichnung', 'WKN', 'ISIN', 'Einstiegskurs', 'Bewertungskurs', 'Stückzahl', 'Absoluter Gewinn', 'Relativer Gewinn', 'Assetklasse'];
const ROWS = [['15.03.2026', '900001234', 'MUSTER ETF WORLD', 'A0TEST', 'XX0000000001', '50,00 €', '62,50 €', '100,5', '1.256,25 €', '25.00%', 'ETFs'],
  ['15.03.2026', '900001234', 'BEISPIEL AG', 'B0TEST', 'XX0000000002', '20,00 €', '10,00 €', '30', '-300,00 €', '-50.00%', 'Aktien']];
const csv = (sep) => Buffer.from([HEAD, ...ROWS].map((r) => r.map((c) => (sep === ';' ? `"${c}"` : c)).join(sep)).join('\n'));

test('recognised by its header; semicolon and tab files give the same positions and total', () => {
  assert.equal(depot.isDepotExport(csv(';')), true);
  assert.equal(depot.isDepotExport(Buffer.from('Buchungstag;Betrag\n01.01.2026;1,00')), false);
  for (const sep of [';', '\t']) {
    const d = depot.parse(csv(sep));
    assert.equal(d.on, '2026-03-15'); assert.equal(d.label, 'Depot …1234', 'only the last four digits of the depot number');
    assert.deepEqual(d.positions.map((p) => [p.name, p.qty, p.price_cents, p.value_cents, p.invested_cents]), [['MUSTER ETF WORLD', 100.5, 6250, 628125, 502500], ['BEISPIEL AG', 30, 1000, 30000, 60000]]);
    assert.equal(d.total_cents, 658125);
  }
});

test('import stores the total as a value point and the positions; the same day again replaces them', () => {
  assert.deepEqual(depot.importDepot(csv(';')), { label: 'Depot …1234', on: '2026-03-15', positions: 2, total_cents: 658125 });
  depot.importDepot(csv('\t'));
  const w = wealth.overview(new Date('2026-03-20T12:00:00Z'));
  assert.equal(w.now.other, 658125);
  assert.equal(w.positions.length, 2);
  assert.throws(() => depot.parse(Buffer.from('Wertpapierbezeichnung;Kurs\nX;1')), /Spalten/);
});
