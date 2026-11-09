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

// Was die Familie betrifft: Schulweg, Ringbahn Messe Nord, Stadtbahn ab Charlottenburg.
const WATCH = [
  { id: '900024104', label: 'M49 Amtsgerichtsplatz', lines: /^M49$/, products: '' },
  { id: '900024106', label: 'Ringbahn Messe Nord', lines: /^S4[12]$/, products: 'suburban' },
  { id: '900024101', label: 'Stadtbahn Charlottenburg', lines: /^S(3|5|7|9)$/, products: 'suburban' },
];
const plain = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 130);

async function alerts(watch = WATCH) {
  const out = [];
  for (const w of watch) {
    const data = await get(`/stops/${w.id}/departures?${new URLSearchParams({ duration: '40', results: '30', remarks: 'true', ...(w.products ? { subway: 'false', bus: 'false', tram: 'false', regional: 'false', express: 'false', ferry: 'false' } : {}) })}`);
    const list = (data.departures || []).filter((d) => w.lines.test(d.line?.name || ''));
    const gone = [...new Set(list.filter((d) => d.cancelled).map((d) => d.line.name))];
    if (gone.length) out.push({ label: w.label, text: `${gone.join(', ')} ${gone.length > 1 ? 'fallen' : 'fällt'} aus` });
    const seen = new Set();
    for (const d of list) for (const r of d.remarks || []) {
      if (r.type !== 'warning') continue;
      const text = plain(r.summary || r.text);
      if (text && !seen.has(text)) { seen.add(text); out.push({ label: w.label, text }); }
    }
  }
  return out;
}

const SCHOOL_STOP = { id: '900024104', name: 'Amtsgerichtsplatz' };
const berlinHour = (now) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(now));

/** Abfahrtstafel fürs Startbild: morgens nur Richtung Westen zum Herder-Gymnasium. */
async function board(now = new Date(), stop = SCHOOL_STOP) {
  const hour = berlinHour(now); const morning = hour >= 5 && hour < 10;
  const list = await departures(stop.id, { minutes: 60, results: 12 });
  const tagged = list.map((d) => ({ ...d, towards: /Zoologischer|\bZoo\b/.test(d.direction) ? 'Zoo' : /Staaken|Heerstr|Nennhauser|Reimerweg/.test(d.direction) ? 'Westen' : '' }));
  const west = tagged.filter((d) => d.towards === 'Westen'); const rest = tagged.filter((d) => d.towards !== 'Westen');
  // Morgens zählt nur der Schulweg, sonst je Richtung die nächsten.
  const chosen = morning ? west.slice(0, 3) : [...west.slice(0, 2), ...rest.slice(0, 1)].sort((x, y) => String(x.when).localeCompare(String(y.when)));
  return { stop: stop.name, morning, departures: chosen };
}

module.exports = { stops, departures, alerts, board, setFetch };
