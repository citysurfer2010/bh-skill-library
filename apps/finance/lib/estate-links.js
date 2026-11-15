'use strict';
/**
 * Drive folders of the flats (Matti 15.11.2026: "die Drive-Ordner für jede Immobilie mitverlinken").
 * A folder is named like the sheet's address ("PLZ, Ort, Straße Nr, Lage, WE 30, WE 31"): street part and a common
 * flat number decide; "WE 27a" and "WE 27, SP 16" belong to the folder of WE 27.
 */
const { getDb } = require('./db');

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const street = (s) => String(s || '').split(',').slice(0, 3).map(norm).join(',');
const flats = (s) => new Set([...String(s || '').matchAll(/WE\s*(\d+)/gi)].map((m) => m[1].replace(/^0+/, '')));
const url = (id) => (id && /^[\w-]{10,}$/.test(id) ? `https://drive.google.com/drive/folders/${id}` : null);

/** Folders [{ name, id, financeId }] onto flats [{ unit_key, address, unit }]: one folder per flat or none. */
function match(folders, units) {
  const out = [];
  for (const u of units) {
    const nums = flats(u.unit);
    const hits = folders.filter((f) => street(f.name) === street(u.address) && [...flats(f.name)].some((n) => nums.has(n)));
    if (hits.length === 1) out.push({ unit_key: u.unit_key, folder_url: url(hits[0].id), finance_url: url(hits[0].financeId) });
  }
  return out;
}

function importLinks({ folders = [] }) {
  const db = getDb(); const units = db.prepare('SELECT unit_key, address, unit FROM estate_units').all();
  const links = match(folders, units);
  const ins = db.prepare('INSERT INTO estate_links (unit_key, folder_url, finance_url) VALUES (?, ?, ?) ON CONFLICT (unit_key) DO UPDATE SET folder_url = excluded.folder_url, finance_url = excluded.finance_url');
  db.exec('BEGIN IMMEDIATE');
  try { for (const l of links) ins.run(l.unit_key, l.folder_url, l.finance_url); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { linked: links.length, units: units.length, missing: units.filter((u) => !links.some((l) => l.unit_key === u.unit_key)).map((u) => u.unit_key) };
}

const of = (unitKey) => getDb().prepare('SELECT folder_url, finance_url FROM estate_links WHERE unit_key = ?').get(unitKey) || {};

module.exports = { match, importLinks, of };
