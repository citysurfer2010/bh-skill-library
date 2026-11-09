/** Haltestellen und Abfahrten der BVG. Offene Schnittstelle, ohne Schlüssel. */
'use strict';

const BASE = 'https://v6.bvg.transport.rest';
let http = (...a) => fetch(...a);
const setFetch = (f) => { http = f; };

async function get(path) {
  let r;
  try { r = await http(BASE + path, { headers: { 'user-agent': 'bh-platform/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(12000) }); } catch { throw new Error('BVG-Dienst nicht erreichbar'); }
  if (!r.ok) throw new Error(`BVG-Dienst antwortet nicht (${r.status})`);
  return r.json();
}

async function stops(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Haltestelle fehlt');
  const list = await get(`/locations?${new URLSearchParams({ query: q, results: '5', stops: 'true', addresses: 'false', poi: 'false' })}`);
  return list.filter((s) => s.type === 'stop').map((s) => ({ id: s.id, name: s.name }));
}

async function departures(stop, { minutes = 30, results = 8 } = {}) {
  if (!/^\d{5,12}$/.test(String(stop))) throw new Error('Haltestellen-Kennung ungültig');
  const data = await get(`/stops/${stop}/departures?${new URLSearchParams({ duration: String(Math.min(Number(minutes) || 30, 120)), results: String(Math.min(Number(results) || 8, 20)), remarks: 'false' })}`);
  return (data.departures || []).map((d) => ({ line: d.line?.name || '?', direction: d.direction || '', when: d.when || d.plannedWhen, delayMinutes: d.delay ? Math.round(d.delay / 60) : 0, cancelled: !!d.cancelled }));
}

module.exports = { stops, departures, setFetch };
