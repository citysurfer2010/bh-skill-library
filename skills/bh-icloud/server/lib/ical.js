/** Parses iCalendar and vCard text into plain fields. Times are reported in the family's time zone. */
'use strict';

const ZONE = 'Europe/Berlin';
const DESCRIPTION_LIMIT = 800;

const localIso = (date) => date.toLocaleString('sv-SE', { timeZone: ZONE }).replace(' ', 'T');

// Midnight of a calendar day in Berlin, as an absolute instant (handles daylight saving).
function berlinMidnight(day) {
  const guess = new Date(`${day}T00:00:00Z`);
  return new Date(guess.getTime() - (new Date(`${localIso(guess)}Z`).getTime() - guess.getTime()));
}

const icalUtc = (date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');
const unfold = (raw) => raw.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
const unescapeValue = (v) => v.replace(/\\([nN,;\\])/g, (_m, c) => (c === 'n' || c === 'N' ? '\n' : c));

// NAME;PARAM=x;PARAM="a:b":value, where a colon inside a quoted parameter is not the separator.
function parseLine(line) {
  let quoted = false; let colon = -1;
  for (let i = 0; i < line.length && colon < 0; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) colon = i;
  }
  if (colon < 0) return null;
  const [rawName, ...rawParams] = line.slice(0, colon).split(';');
  const params = Object.fromEntries(rawParams.map((p) => { const i = p.indexOf('='); return [p.slice(0, i).toUpperCase(), p.slice(i + 1).replace(/"/g, '')]; }));
  return { name: rawName.replace(/^[^.]*\./, '').toUpperCase(), params, value: line.slice(colon + 1) };
}

function timeField(prop) {
  const v = prop.value;
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (day) return { value: `${day[1]}-${day[2]}-${day[3]}`, allDay: true };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return { value: v };
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  return m[7] ? { value: localIso(new Date(`${iso}Z`)), timezone: ZONE } : { value: iso, timezone: prop.params.TZID || null };
}

// iCalendar all-day ends are exclusive; callers get the last day that is really occupied.
function previousDay(day) {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

function toEvent(props) {
  const start = timeField(props.DTSTART);
  const end = props.DTEND ? timeField(props.DTEND) : null;
  const allDay = !!start.allDay;
  const event = {
    title: unescapeValue(props.SUMMARY?.value || ''),
    start: start.value,
    end: allDay ? (end ? previousDay(end.value) : start.value) : (end?.value ?? null),
    all_day: allDay,
  };
  if (start.timezone) event.timezone = start.timezone;
  if (props.LOCATION?.value) event.location = unescapeValue(props.LOCATION.value);
  if (props.DESCRIPTION?.value) event.description = unescapeValue(props.DESCRIPTION.value).slice(0, DESCRIPTION_LIMIT);
  if (props.STATUS?.value && props.STATUS.value !== 'CONFIRMED') event.status = props.STATUS.value.toLowerCase();
  if (props.RRULE?.value) event.recurrence = props.RRULE.value; // Only present if the server did not expand the series.
  return event;
}

function parseEvents(raw) {
  const events = []; let props = null; let nested = 0;
  for (const line of unfold(raw)) {
    if (line === 'BEGIN:VEVENT') { props = {}; nested = 0; continue; }
    if (line === 'END:VEVENT') { if (props?.DTSTART) events.push(toEvent(props)); props = null; continue; }
    if (!props) continue;
    if (line.startsWith('BEGIN:')) { nested++; continue; }
    if (line.startsWith('END:')) { nested--; continue; }
    if (nested) continue;
    const p = parseLine(line);
    if (p && !(p.name in props)) props[p.name] = p;
  }
  return events;
}

function parseContacts(raw) {
  const contacts = []; let card = null;
  for (const line of unfold(raw)) {
    if (line.toUpperCase() === 'BEGIN:VCARD') { card = { name: '', emails: [], phones: [], addresses: [] }; continue; }
    if (line.toUpperCase() === 'END:VCARD') { if (card && !card.group) { delete card.group; contacts.push(card); } card = null; continue; }
    if (!card) continue;
    const p = parseLine(line);
    if (!p) continue;
    const value = unescapeValue(p.value);
    if (p.name === 'FN') card.name = value;
    else if (p.name === 'N' && !card.name) card.name = value.split(';').slice(0, 2).reverse().filter(Boolean).join(' ');
    else if (p.name === 'ORG') card.organization = value.split(';').filter(Boolean).join(', ');
    else if (p.name === 'TITLE') card.job_title = value;
    else if (p.name === 'EMAIL') card.emails.push(value);
    else if (p.name === 'TEL') card.phones.push(value);
    else if (p.name === 'ADR') card.addresses.push(value.split(';').map((s) => s.trim()).filter(Boolean).join(', '));
    else if (p.name === 'BDAY') card.birthday = value;
    else if (p.name === 'X-ADDRESSBOOKSERVER-KIND' && value.toLowerCase() === 'group') card.group = true;
  }
  return contacts;
}

module.exports = { parseEvents, parseContacts, berlinMidnight, icalUtc, ZONE };
