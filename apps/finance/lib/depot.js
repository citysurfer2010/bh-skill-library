'use strict';
/**
 * Depot exports (22.11.2026: a DKB depot export was refused by the transaction import). One row per position:
 * "Datum der Erstellung", "Depotnummer", "Wertpapierbezeichnung", "WKN", "ISIN", "Einstiegskurs", "Bewertungskurs",
 * "Stückzahl", "Absoluter Gewinn", "Relativer Gewinn", "Assetklasse". The value of a position is price times quantity;
 * the depot's total becomes a point of the asset "Depot …<last 4 digits>" on the export date, the positions are kept.
 */
const { getDb } = require('./db');
const { parseCsv, decode } = require('./importers');
const wealth = require('./wealth');

const num = (s) => { const t = String(s ?? '').replace(/[€%\s]/g, '').replace(/\./g, '').replace(',', '.'); const n = Number(t); return Number.isFinite(n) ? n : null; };
const isoDate = (s) => { const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(s || '')); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Recognised by its header: name, price and quantity of securities. */
function isDepotExport(buffer) {
  const head = decode(buffer).split(/\r?\n/).slice(0, 5).join(' ').toLowerCase();
  return /wertpapierbezeichnung/.test(head) && /bewertungskurs/.test(head) && /stückzahl|stueckzahl/.test(head);
}

function parse(buffer) {
  let text = decode(buffer);
  const first = text.split(/\r?\n/)[0] || '';
  if ((first.match(/\t/g) || []).length > (first.match(/;/g) || []).length) text = text.replace(/\t/g, ';');
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r.some((c) => /wertpapierbezeichnung/i.test(c)));
  if (h < 0) throw Object.assign(new Error('Kein Depot-Export erkannt'), { status: 400 });
  const col = (name) => rows[h].findIndex((c) => norm(c) === name);
  const C = { date: col('datum der erstellung'), depot: col('depotnummer'), name: col('wertpapierbezeichnung'), wkn: col('wkn'), isin: col('isin'), buy: col('einstiegskurs'), price: col('bewertungskurs'), qty: rows[h].findIndex((c) => /^st(ü|ue)ckzahl$/.test(norm(c))), gain: col('absoluter gewinn'), cls: col('assetklasse') };
  if ([C.name, C.price, C.qty].some((i) => i < 0)) throw Object.assign(new Error('Spalten Wertpapierbezeichnung, Bewertungskurs oder Stückzahl fehlen'), { status: 400 });
  const positions = rows.slice(h + 1).map((r) => {
    const price = num(r[C.price]); const qty = num(r[C.qty]); const buy = C.buy >= 0 ? num(r[C.buy]) : null;
    if (!r[C.name] || price == null || qty == null) return null;
    return { name: r[C.name].trim(), wkn: C.wkn >= 0 ? r[C.wkn].trim() : '', isin: C.isin >= 0 ? r[C.isin].trim() : '', qty, price_cents: Math.round(price * 100), value_cents: Math.round(price * qty * 100), invested_cents: buy == null ? null : Math.round(buy * qty * 100), asset_class: C.cls >= 0 ? (r[C.cls] || '').trim() : '' };
  }).filter(Boolean);
  if (!positions.length) throw Object.assign(new Error('Keine Positionen gefunden'), { status: 400 });
  const firstRow = rows[h + 1] || [];
  const on = (C.date >= 0 && isoDate(firstRow[C.date])) || new Date().toISOString().slice(0, 10);
  const depot = C.depot >= 0 ? String(firstRow[C.depot] || '').replace(/\D/g, '') : '';
  return { on, label: depot ? `Depot …${depot.slice(-4)}` : 'Depot', positions, total_cents: positions.reduce((s, p) => s + p.value_cents, 0) };
}

/** Stores the total as a value point and replaces the positions of that depot and day. */
function importDepot(buffer) {
  const d = parse(buffer); const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    wealth.addAsset({ name: d.label, kind: 'Depot', value_cents: d.total_cents, as_of: d.on });
    db.prepare('DELETE FROM wealth_positions WHERE asset_name = ? AND as_of = ?').run(d.label, d.on);
    const ins = db.prepare('INSERT INTO wealth_positions (asset_name, as_of, name, wkn, isin, qty, price_cents, value_cents, invested_cents, asset_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of d.positions) ins.run(d.label, d.on, p.name, p.wkn, p.isin, p.qty, p.price_cents, p.value_cents, p.invested_cents, p.asset_class);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { label: d.label, on: d.on, positions: d.positions.length, total_cents: d.total_cents };
}

/** The latest positions of each depot (for the page). */
function positions() {
  return getDb().prepare(`SELECT p.* FROM wealth_positions p JOIN (SELECT asset_name, max(as_of) AS on_ FROM wealth_positions GROUP BY asset_name) l ON l.asset_name = p.asset_name AND l.on_ = p.as_of ORDER BY p.asset_name, p.value_cents DESC`).all().map((r) => ({ ...r }));
}

module.exports = { isDepotExport, parse, importDepot, positions };
