'use strict';
/**
 * Cost of the rented home per year (Matti 22.11.2026: "eine Seite für die Entwicklung der Wohnungskosten, Kosten 2026
 * schätzen"). From the household accounts:
 *  - rent: the landlord's regular payment (the counterparty in "Wohnung" paid most often; an amount paid 3+ times a year)
 *  - settlement: every other payment to or from the landlord (Nebenkostenabrechnung: back payment or refund)
 *  - energy: electricity/gas suppliers, broadcast fee: "Rundfunk"/Beitragsservice
 *  - furnishing: the rest of "Wohnung" (furniture, DIY), shown apart, not part of the housing cost
 * The running year is estimated: rent at the current amount for the months still to come, energy at the average of the
 * last 12 months, the settlement as entered (app_state housing_settlement_<year>) or else the average past settlement.
 */
const { getDb } = require('./db');
const { HOUSEHOLD } = require('./accounts');
const { normalize } = require('./counterparty');

const ENERGY = /stadtwerke|vattenfall|\bstrom\b|gasag|e\.on|\beon\b|octopus|eprimo|enbw|lichtblick|naturstrom|yello|tibber|energie/i;
const BROADCAST = /rundfunk|beitragsservice/i;
const keyOf = (cp) => normalize(String(cp || '').replace(/Kto\/IBAN.*$/i, ''));
const state = (k) => getDb().prepare('SELECT value FROM app_state WHERE key = ?').get(k)?.value;

function setSettlement(year, cents) {
  const key = `housing_settlement_${Number(year)}`;
  if (cents == null) return getDb().prepare('DELETE FROM app_state WHERE key = ?').run(key);
  if (!Number.isInteger(cents)) throw Object.assign(new Error('Betrag ungültig'), { status: 400 });
  return getDb().prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, String(cents));
}

function overview(today = new Date()) {
  const db = getDb(); const thisYear = today.getUTCFullYear();
  const lines = db.prepare(`SELECT booked_on, amount_cents AS cents, counterparty, text, category FROM transactions
    WHERE ${HOUSEHOLD} AND (category IS NULL OR category != 'TRANS') AND (category = 'WOHN' OR lower(counterparty || ' ' || text) GLOB '*rundfunk*' OR lower(counterparty || ' ' || text) GLOB '*beitragsservice*'
    OR lower(counterparty) GLOB '*stadtwerke*' OR lower(counterparty) GLOB '*vattenfall*' OR lower(counterparty) GLOB '*gasag*' OR lower(counterparty) GLOB '*octopus*' OR lower(counterparty) GLOB '*eprimo*' OR lower(counterparty) GLOB '*lichtblick*' OR lower(counterparty) GLOB '*enbw*')
    ORDER BY booked_on`).all();
  // Landlord: the "Wohnung" counterparty paid most often.
  const freq = {}; for (const l of lines) if (l.category === 'WOHN' && l.cents < 0 && !ENERGY.test(l.counterparty) && !BROADCAST.test(`${l.counterparty} ${l.text}`)) { const k = keyOf(l.counterparty); freq[k] = (freq[k] || 0) + 1; }
  const landlord = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const years = new Map(); const at = (y) => years.get(y) || years.set(y, { year: y, rent: 0, settlement: 0, energy: 0, broadcast: 0, furnishing: 0, rentMonths: 0 }).get(y);
  const settlements = []; const byYearAmount = {};
  for (const l of lines) if (keyOf(l.counterparty) === landlord && l.cents < 0) { const k = `${l.booked_on.slice(0, 4)}|${l.cents}`; byYearAmount[k] = (byYearAmount[k] || 0) + 1; }
  let rentNow = null;
  for (const l of lines) {
    const y = Number(l.booked_on.slice(0, 4)); const row = at(y);
    if (landlord && keyOf(l.counterparty) === landlord) {
      if (l.cents < 0 && byYearAmount[`${y}|${l.cents}`] >= 3) { row.rent += l.cents; row.rentMonths += 1; rentNow = l.cents; } else { row.settlement += l.cents; settlements.push({ on: l.booked_on, cents: l.cents }); }
    } else if (BROADCAST.test(`${l.counterparty} ${l.text}`)) row.broadcast += l.cents;
    else if (ENERGY.test(l.counterparty)) row.energy += l.cents;
    else if (l.category === 'WOHN') row.furnishing += l.cents;
  }
  const list = [...years.values()].sort((a, b) => a.year - b.year);
  for (const r of list) { r.total = r.rent + r.settlement + r.energy + r.broadcast; r.months = r.year === thisYear ? today.getUTCMonth() + 1 : 12; r.perMonth = Math.round(r.total / 12); }
  // Estimate of the running year.
  const cur = years.get(thisYear); let estimate = null;
  if (cur) {
    const left = Math.max(0, 12 - cur.rentMonths);
    const since = new Date(Date.UTC(thisYear - 1, today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10);
    const energy12 = lines.filter((l) => l.booked_on > since && ENERGY.test(l.counterparty) && !BROADCAST.test(`${l.counterparty} ${l.text}`)).reduce((s, l) => s + l.cents, 0);
    const past = settlements.filter((s) => Number(s.on.slice(0, 4)) < thisYear).slice(-3);
    const entered = state(`housing_settlement_${thisYear}`); const enteredCents = entered != null ? Number(entered) : null;
    // A settlement booked this year wins; otherwise the amount entered on the page; otherwise the average of past ones.
    const avg = past.length ? Math.round(past.reduce((s, x) => s + x.cents, 0) / past.length) : 0;
    const settlement = cur.settlement ? cur.settlement : enteredCents != null ? enteredCents : avg;
    const source = cur.settlement ? 'gebucht' : enteredCents != null ? 'eingetragen' : past.length ? `Schnitt der letzten ${past.length} Abrechnungen` : 'keine';
    const prev = years.get(thisYear - 1);
    const e = {
      rent: cur.rent + (rentNow || 0) * left,
      settlement,
      energy: cur.energy + Math.round((energy12 / 12) * (12 - cur.months)),
      broadcast: cur.broadcast || prev?.broadcast || 0,
    };
    e.total = e.rent + e.settlement + e.energy + e.broadcast; e.perMonth = Math.round(e.total / 12);
    estimate = { ...e, rentLeftMonths: left, settlementSource: source, settlementEntered: enteredCents, settlementAverage: avg };
  }
  const liquid = require('./accounts').totals().haushalt?.cents || 0; // private accounts' bank balances
  return { thisYear, liquid, landlord: landlord ? lines.find((l) => keyOf(l.counterparty) === landlord)?.counterparty.replace(/Kto\/IBAN.*$/i, '').trim() : null, rentNow, years: list, settlements, estimate };
}

module.exports = { overview, setSettlement };
