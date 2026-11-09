'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEvents, parseContacts, berlinMidnight } = require('../lib/ical.js');
const { parseMessage, decodeWords } = require('../lib/mime.js');

const ics = (...lines) => ['BEGIN:VCALENDAR', ...lines, 'END:VCALENDAR'].join('\r\n');

test('events: UTC times become Berlin time, folded lines and escapes are resolved', () => {
  const [e] = parseEvents(ics('BEGIN:VEVENT', 'DTSTART:20260701T100000Z', 'DTEND:20260701T110000Z', 'SUMMARY:Arzt\\, Dr. M', ' üller', 'LOCATION:Kantstr. 1\\nBerlin', 'END:VEVENT'));
  assert.equal(e.start, '2026-07-01T12:00:00'); assert.equal(e.timezone, 'Europe/Berlin');
  assert.equal(e.title, 'Arzt, Dr. Müller'); assert.equal(e.location, 'Kantstr. 1\nBerlin');
});

test('events: all-day end is the last occupied day', () => {
  const [e] = parseEvents(ics('BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261112', 'SUMMARY:Urlaub', 'END:VEVENT'));
  assert.deepEqual([e.start, e.end, e.all_day], ['2026-11-10', '2026-11-11', true]);
});

test('events: TZID stays, alarm fields do not overwrite the event, unexpanded series are flagged', () => {
  const [e] = parseEvents(ics('BEGIN:VEVENT', 'DTSTART;TZID=Europe/Berlin:20261110T090000', 'SUMMARY:Sport', 'RRULE:FREQ=WEEKLY', 'BEGIN:VALARM', 'DESCRIPTION:Erinnerung', 'END:VALARM', 'END:VEVENT'));
  assert.equal(e.start, '2026-11-10T09:00:00'); assert.equal(e.timezone, 'Europe/Berlin');
  assert.equal(e.description, undefined); assert.equal(e.recurrence, 'FREQ=WEEKLY');
});

test('berlin midnight respects daylight saving', () => {
  assert.equal(berlinMidnight('2026-07-01').toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(berlinMidnight('2026-12-01').toISOString(), '2026-11-30T23:00:00.000Z');
});

test('contacts: groups are skipped, Apple item prefixes are removed', () => {
  const c = parseContacts(['BEGIN:VCARD', 'FN:Anna Beispiel', 'item1.EMAIL;type=INTERNET:anna@example.org', 'TEL;type=CELL:+49 170 1234', 'ADR:;;Weg 1;Berlin;;10115;', 'END:VCARD', 'BEGIN:VCARD', 'FN:Familie', 'X-ADDRESSBOOKSERVER-KIND:group', 'END:VCARD'].join('\r\n'));
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].emails, ['anna@example.org']); assert.deepEqual(c[0].addresses, ['Weg 1, Berlin, 10115']);
});

test('mime: encoded words in several charsets', () => {
  assert.equal(decodeWords('=?UTF-8?B?R3LDvMOfZQ==?= =?ISO-8859-1?Q?_von_M=FCller?='), 'Grüße von Müller');
});

test('mime: multipart prefers plain text, attachments are named not returned', () => {
  const raw = ['From: a@b', 'Content-Type: multipart/mixed; boundary="X"', '', '--X', 'Content-Type: multipart/alternative; boundary=Y', '', '--Y', 'Content-Type: text/plain; charset=iso-8859-1', 'Content-Transfer-Encoding: quoted-printable', '', 'Gr=FC=DFe', '--Y', 'Content-Type: text/html', '', '<p>html</p>', '--Y--', '--X', 'Content-Type: application/pdf; name="r.pdf"', 'Content-Disposition: attachment; filename="r.pdf"', 'Content-Transfer-Encoding: base64', '', 'AAEC', '--X--', ''].join('\r\n');
  const m = parseMessage(Buffer.from(raw, 'latin1'));
  assert.equal(m.text, 'Grüße');
  assert.deepEqual(m.attachments, [{ name: 'r.pdf', type: 'application/pdf', size: 3 }]);
});

test('mime: html-only mail becomes readable text without styles', () => {
  const m = parseMessage(Buffer.from('Content-Type: text/html; charset=utf-8\r\n\r\n<style>p{}</style><p>Hallo &amp; tsch&uuml;ss</p><br>Ende', 'utf8'));
  assert.equal(m.text, 'Hallo & tschüss\n\nEnde');
});
