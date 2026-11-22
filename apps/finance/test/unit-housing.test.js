'use strict';
/** Wohnkosten (Matti 22.11.2026): rent, Nebenkostenabrechnung, energy, broadcast fee per year and an estimate of the running year. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-housing-'));
const { getDb } = require('../lib/db');
const db = getDb();
db.prepare("INSERT INTO categories (code, art, name) VALUES ('WOHN', 'Ausgaben', 'Wohnung'), ('LEBEN', 'Ausgaben', 'Lebensmittel')").run();
db.prepare("INSERT INTO accounts (name, scope, updated_at) VALUES ('Objektkonto', 'immobilien', 'x')").run();
const housing = require('../lib/housing');
let n = 0;
const add = (on, cents, cp, category = 'WOHN', account = 'Giro', text = '') => db.prepare('INSERT INTO transactions (account, booked_on, amount_cents, text, counterparty, category, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'x\')').run(account, on, cents, text, cp, category, `h${n += 1}`);
const LANDLORD = 'Erika und Hans Muster';
for (let m = 1; m <= 12; m += 1) add(`2025-${String(m).padStart(2, '0')}-02`, -90000, `${LANDLORD}Kto/IBAN: XX`);
add('2025-04-10', -120000, `${LANDLORD}Kto/IBAN: XX`); // settlement
for (let m = 1; m <= 12; m += 1) add(`2025-${String(m).padStart(2, '0')}-15`, -10000, 'Stadtwerke Musterstadt');
add('2025-02-01', -22000, 'Rundfunk ARD ZDF', null);
add('2025-06-01', -30000, 'Moebelhaus');
add('2025-06-02', -5000, 'Supermarkt', 'LEBEN');
add('2025-07-02', -90000, `${LANDLORD}Kto/IBAN: XX`, 'WOHN', 'Objektkonto'); // property account: not the household
for (let m = 1; m <= 10; m += 1) add(`2026-${String(m).padStart(2, '0')}-02`, -95000, `${LANDLORD}Kto/IBAN: XX`);
for (let m = 1; m <= 10; m += 1) add(`2026-${String(m).padStart(2, '0')}-15`, -12000, 'Stadtwerke Musterstadt');
add('2026-02-01', -22000, 'Rundfunk ARD ZDF', null);
const TODAY = new Date('2026-10-20T10:00:00Z');

test('years split into rent, settlement, energy, broadcast; furnishing apart; property accounts and other categories ignored', () => {
  const d = housing.overview(TODAY);
  assert.equal(d.landlord, LANDLORD);
  const y = d.years.find((r) => r.year === 2025);
  assert.deepEqual({ rent: y.rent, settlement: y.settlement, energy: y.energy, broadcast: y.broadcast, furnishing: y.furnishing }, { rent: -1080000, settlement: -120000, energy: -120000, broadcast: -22000, furnishing: -30000 });
  assert.equal(y.total, -1342000);
  assert.equal(y.perMonth, -111833);
  assert.equal(d.rentNow, -95000);
  assert.deepEqual(d.settlements, [{ on: '2025-04-10', cents: -120000 }]);
});

test('estimate: rent for the months left, energy by the 12-month average, settlement from the average, entered or booked', () => {
  let e = housing.overview(TODAY).estimate;
  assert.equal(e.rentLeftMonths, 2);
  assert.equal(e.rent, -1140000);
  assert.equal(e.energy, -120000 + Math.round((-140000 / 12) * 2)); // last 12 months: 2 × 100 € + 10 × 120 €
  assert.equal(e.settlement, -120000);
  assert.equal(e.settlementSource, 'Schnitt der letzten 1 Abrechnungen');
  housing.setSettlement(2026, -150000);
  e = housing.overview(TODAY).estimate;
  assert.equal(e.settlement, -150000);
  assert.equal(e.settlementSource, 'eingetragen');
  assert.equal(e.total, e.rent + e.settlement + e.energy + e.broadcast);
  add('2026-10-12', -140000, `${LANDLORD}Kto/IBAN: XX`); // booked settlement wins
  e = housing.overview(TODAY).estimate;
  assert.equal(e.settlement, -140000);
  assert.equal(e.settlementSource, 'gebucht');
  housing.setSettlement(2026, null);
  assert.throws(() => housing.setSettlement(2026, 1.5), /ungültig/);
});
