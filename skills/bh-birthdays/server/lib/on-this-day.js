'use strict';
/** "On this day": picks only nice items from Wikipedia for the birthday screen. Only month and day are sent. */
const fs = require('fs');
const path = require('path');

const dir = () => process.env.BH_FAMILY_DIR || '/tmp/bh-family';
const FILE = () => path.join(dir(), 'on-this-day.json');
const BAD = /(\btod\b|\btot\b|\btote|stirbt|starb|getötet|ermord|\bmord|krieg|kämpf|schlacht|angriff|anschlag|attentat|terror|bomb|diktat|nazi|nationalsozial|nsdap|hitler|stalin|konzentrationslager|holocaust|pogrom|verhaft|festgenommen|verurteil|hinricht|spionage|putsch|aufstand|unruhen|protest|massaker|absturz|abgestürzt|unglück|katastroph|erdbeben|sturm|flut|brand|feuer|explosion|opfer|verletz|\bpest\b|epidemie|seuche|pandemie|krise|besetz|invasion|annektier|vertreib|flucht|sklav|rücktritt|skandal|selbstmord|nimmt sich|exekut|gefängnis|\bhaft|verbot|zerstör|untergang|sinkt|gesunken|kanzler|präsident|minister\b|ministers\b|außenminister|gasmaske|waffe|regierung|parlament|partei|bundestag|\bwahl|general|könig|kaiser|papst)/i;
const GOOD = /(erstmals|erste|uraufführ|premiere|erfind|erfunden|patent|gründ|eröffn|rekord|\bfilm|musical|\boper|musik|album|spiel|konsole|nobelpreis|entdeck|raumfahr|weltraum|\bmond|satellit|sonde|kunst|museum|\bzoo|comic|ampel|bahn|brücke|olympi|meister)/ig;
const PEOPLE = /(schauspieler|musiker|sänger|komponist|autor|schriftsteller|regisseur|fußball|sportler|maler|comiczeichner|wissenschaftler|physiker|astronaut|erfinder)/i;
const MAX_FACT = 125; const MAX_BORN = 80;

const clean = (t) => String(t || '').replace(/­/g, '').replace(/\s*\(Bild(?:, [^)]*)?\)/g, '').replace(/\s+/g, ' ').trim();
const good = (t) => (t.match(GOOD) || []).length;

/** Three nice events and one famous person from the same day. Pure, so it stays testable. */
function select(feed) {
  const seen = new Set(); const facts = [];
  const pool = [...(feed.selected || []).map((e) => ({ ...e, boost: 2 })), ...(feed.events || []).map((e) => ({ ...e, boost: 0 }))]
    .map((e) => ({ year: e.year, text: clean(e.text), boost: e.boost }))
    .filter((e) => e.year && e.text.length <= MAX_FACT && !BAD.test(e.text) && good(e.text))
    .sort((a, b) => (good(b.text) + b.boost) - (good(a.text) + a.boost) || b.year - a.year);
  for (const e of pool) {
    if (seen.has(e.text) || facts.length === 3) continue;
    seen.add(e.text); facts.push({ year: e.year, text: e.text });
  }
  const born = (feed.births || [])
    .map((e) => ({ year: e.year, text: clean(e.text), weight: clean(e.pages?.[0]?.extract).length }))
    .filter((e) => e.year >= 1900 && e.text.length <= MAX_BORN && PEOPLE.test(e.text) && !BAD.test(e.text))
    .sort((a, b) => b.weight - a.weight)[0];
  facts.sort((a, b) => a.year - b.year);
  return { facts, born: born ? { year: born.year, text: born.text } : null };
}

const berlinDate = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
function read() { try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return null; } }
function forToday(now = new Date()) { const c = read(); return c && c.date === berlinDate(now) ? c.data : null; }

/** Fetches the data at most once a day. Returns true when there is something new. */
async function prepare(now = new Date(), load = fetch) {
  if (forToday(now)) return false;
  const date = berlinDate(now);
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/de/onthisday/all/${date.slice(5, 7)}/${date.slice(8)}`;
  const res = await load(url, { headers: { 'user-agent': 'BH-Beamer/1.0' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify({ date, data: select(await res.json()) }));
  return true;
}

module.exports = { select, forToday, prepare };
