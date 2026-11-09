/** iCloud calendars over CalDAV. */
'use strict';

const { dav, homeSet, responses, all, first, has, text, safeUrl } = require('./dav.js');
const { parseEvents, berlinMidnight, icalUtc } = require('./ical.js');

const CALDAV = 'urn:ietf:params:xml:ns:caldav';
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

async function listCalendars() {
  const home = await homeSet('https://caldav.icloud.com/', 'calendar-home-set', CALDAV);
  const body = `<d:propfind xmlns:d="DAV:" xmlns:c="${CALDAV}"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`;
  const { url, xml } = await dav('PROPFIND', home, body, '1');
  return responses(xml).filter((r) => has(first(r.props, 'resourcetype') || '', 'calendar')).map((r) => ({
    id: r.href.replace(/\/$/, '').split('/').pop(),
    name: text(first(r.props, 'displayname') || ''),
    has_events: /name="VEVENT"/i.test(first(r.props, 'supported-calendar-component-set') || 'name="VEVENT"'),
    url: safeUrl(r.href, url),
  }));
}

function parseDay(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw new Error(`${label}: bitte als JJJJ-MM-TT angeben`);
  return String(value);
}

function range(from, to) {
  const firstDay = from ? parseDay(from, 'from') : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const lastDay = to ? parseDay(to, 'to') : new Date(Date.parse(`${firstDay}T12:00:00Z`) + 13 * DAY_MS).toISOString().slice(0, 10);
  const days = (Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / DAY_MS;
  if (days < 0) throw new Error('to liegt vor from');
  if (days > MAX_RANGE_DAYS) throw new Error(`Zeitraum zu lang, hoechstens ${MAX_RANGE_DAYS} Tage`);
  const nextDay = new Date(Date.parse(`${lastDay}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  return { firstDay, lastDay, start: icalUtc(berlinMidnight(firstDay)), end: icalUtc(berlinMidnight(nextDay)) };
}

const query = (start, end) => `<c:calendar-query xmlns:d="DAV:" xmlns:c="${CALDAV}"><d:prop><c:calendar-data><c:expand start="${start}" end="${end}"/></c:calendar-data></d:prop>`
  + `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${start}" end="${end}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;

async function listEvents({ from, to, calendar, limit }) {
  const span = range(from, to);
  const wanted = (await listCalendars()).filter((c) => c.has_events && (!calendar || c.id === calendar || c.name === calendar));
  if (!wanted.length) throw new Error('Kalender nicht gefunden');
  const results = await Promise.allSettled(wanted.map(async (c) => {
    const { xml } = await dav('REPORT', c.url, query(span.start, span.end), '1');
    return responses(xml).flatMap((r) => all(r.props, 'calendar-data').flatMap((d) => parseEvents(text(d)))).map((e) => ({ ...e, calendar: c.name }));
  }));
  const events = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => a.start.localeCompare(b.start));
  const failed = wanted.filter((_c, i) => results[i].status === 'rejected').map((c) => c.name);
  if (failed.length === wanted.length) throw results[0].reason;
  return { from: span.firstDay, to: span.lastDay, total: events.length, truncated: events.length > limit, events: events.slice(0, limit), ...(failed.length ? { failed_calendars: failed } : {}) };
}

module.exports = { listCalendars, listEvents };
