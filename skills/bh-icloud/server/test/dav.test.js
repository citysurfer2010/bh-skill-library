'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'icloud-'));
const dav = require('../lib/dav.js');
const tools = require('../tools/index.js');
const text = (r) => r.content[0].text;
const run = async (name, args) => { const out = text(await tools.TOOLS[name].handler(args)); if (out.startsWith('Fehler')) throw new Error(out); return JSON.parse(out); };

function connect() {
  const d = path.join(process.env.HOME, '.config/bh-icloud'); fs.mkdirSync(d, { recursive: true });
  fs.rmSync(path.join(d, '.rejected-dav'), { force: true });
  require('../lib/contacts.js').clearCache();
  fs.writeFileSync(path.join(d, '.env'), 'BH_ICLOUD_APPLE_ID=a@example.org\nBH_ICLOUD_PASSWORD=abcd-efgh-ijkl-mnop\nBH_ICLOUD_MAIL_USER=a@icloud.com\n');
}
const ok = (href, props) => `<response xmlns="DAV:"><href>${href}</href><propstat><prop>${props}</prop><status>HTTP/1.1 200 OK</status></propstat><propstat><prop><getetag/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response>`;
const multi = (...r) => ({ status: 207, body: `<?xml version="1.0"?><multistatus xmlns="DAV:">${r.join('')}</multistatus>` });
const CAL_NS = 'xmlns="urn:ietf:params:xml:ns:caldav"';

function fakeCalendar(seen, overrides = {}) {
  dav.setTransport(async (url, req) => {
    seen.push({ host: url.hostname, path: url.pathname, ...req });
    if (url.pathname === '/') return multi(ok('/', '<current-user-principal><href>/123/principal/</href></current-user-principal>'));
    if (url.pathname === '/123/principal/') return multi(ok('/123/principal/', `<calendar-home-set ${CAL_NS}><href>https://p12-caldav.icloud.com:443/123/calendars/</href></calendar-home-set>`));
    if (req.method === 'PROPFIND') return multi(
      ok('/123/calendars/', '<resourcetype><collection/></resourcetype>'),
      ok('/123/calendars/home/', `<displayname>Privat &amp; Familie</displayname><resourcetype><collection/><calendar ${CAL_NS}/></resourcetype><supported-calendar-component-set ${CAL_NS}><comp name="VEVENT"/></supported-calendar-component-set>`),
      ok('/123/calendars/tasks/', `<displayname>Listen</displayname><resourcetype><collection/><calendar ${CAL_NS}/></resourcetype><supported-calendar-component-set ${CAL_NS}><comp name="VTODO"/></supported-calendar-component-set>`),
      ok('/123/calendars/inbox/', `<resourcetype><schedule-inbox ${CAL_NS}/></resourcetype>`));
    if (overrides.report) return overrides.report(url, req);
    return multi(ok('/123/calendars/home/1.ics', `<calendar-data ${CAL_NS}><![CDATA[BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261110T100000Z\r\nSUMMARY:Termin\r\nEND:VEVENT\r\nEND:VCALENDAR]]></calendar-data>`));
  });
}

test('read-only tools only', () => {
  assert.deepEqual([...tools.TOOL_NAMES].sort(), ['calendars', 'contacts_search', 'events', 'mail_folders', 'mail_read', 'mail_search']);
});

test('not connected: clear message and no request', async () => {
  dav.setTransport(async () => assert.fail('no request expected'));
  const r = await tools.TOOLS.calendars.handler({});
  assert.equal(r.isError, true); assert.match(text(r), /Verbundene Dienste/);
});

test('calendars: discovery follows the partition host, only real event calendars', async () => {
  connect(); const seen = [];
  fakeCalendar(seen);
  assert.deepEqual(await run('calendars', {}), [{ id: 'home', name: 'Privat & Familie' }]);
  assert.equal(seen.at(-1).host, 'p12-caldav.icloud.com');
  assert.ok(seen.every((s) => s.headers.authorization === `Basic ${Buffer.from('a@example.org:abcd-efgh-ijkl-mnop').toString('base64')}`));
});

test('events: time range is Berlin days and the series expansion is requested', async () => {
  connect(); const seen = [];
  fakeCalendar(seen);
  const r = await run('events', { from: '2026-11-10', to: '2026-11-10' });
  assert.equal(r.events[0].start, '2026-11-10T11:00:00'); assert.equal(r.events[0].calendar, 'Privat & Familie');
  const report = seen.find((s) => s.method === 'REPORT');
  assert.match(report.body, /time-range start="20261109T230000Z" end="20261110T230000Z"/);
  assert.match(report.body, /<c:expand /);
});

test('events: invalid ranges are refused without a request', async () => {
  connect();
  dav.setTransport(async () => assert.fail('no request expected'));
  for (const args of [{ from: 'morgen' }, { from: '2026-11-10', to: '2026-11-01' }, { from: '2026-01-01', to: '2028-01-01' }]) {
    assert.equal((await tools.TOOLS.events.handler(args)).isError, true);
  }
});

test('events: one failing calendar is reported, not hidden', async () => {
  connect();
  fakeCalendar([], { report: async () => ({ status: 503, body: '' }) });
  assert.equal((await tools.TOOLS.events.handler({})).isError, true);
});

test('credentials never leave icloud.com', async () => {
  connect(); const seen = [];
  dav.setTransport(async (url) => { seen.push(url.hostname); return { status: 302, location: 'https://evil.example/steal' }; });
  const r = await tools.TOOLS.calendars.handler({});
  assert.match(text(r), /fremde Adresse/); assert.deepEqual(seen, ['caldav.icloud.com']);
  for (const bad of ['http://caldav.icloud.com/', 'https://icloud.com.evil.example/', 'https://evilicloud.com/']) assert.throws(() => dav.safeUrl(bad));
});

test('redirects keep the login', async () => {
  connect(); const seen = [];
  fakeCalendar(seen);
  dav.setTransport(async (url, req) => { seen.push(req.headers.authorization); return url.hostname === 'caldav.icloud.com' ? { status: 301, location: 'https://p1-caldav.icloud.com/' } : multi(ok('/', '<x/>')); });
  await dav.dav('PROPFIND', 'https://caldav.icloud.com/', '<a/>', '0');
  assert.equal(seen.length, 2); assert.equal(seen[0], seen[1]); assert.ok(seen[0]);
});

test('401 asks to reconnect and blocks further attempts so Apple does not lock the account', async () => {
  connect(); let calls = 0;
  dav.setTransport(async () => { calls++; return { status: 401, body: '' }; });
  assert.match(text(await tools.TOOLS.calendars.handler({})), /neu verbinden/);
  assert.match(text(await tools.TOOLS.calendars.handler({})), /gesperrt/);
  assert.equal(calls, 1);
  connect();
  await tools.TOOLS.calendars.handler({});
  assert.equal(calls, 2);
});

test('contacts: all books in batches, searched locally by name and phone', async () => {
  connect(); const reports = [];
  const CARD = 'xmlns="urn:ietf:params:xml:ns:carddav"';
  dav.setTransport(async (url, req) => {
    if (url.pathname === '/') return multi(ok('/', '<current-user-principal><href>/9/principal/</href></current-user-principal>'));
    if (url.pathname === '/9/principal/') return multi(ok('/9/principal/', `<addressbook-home-set ${CARD}><href>https://p3-contacts.icloud.com/9/carddavhome/</href></addressbook-home-set>`));
    if (url.pathname === '/9/carddavhome/') return multi(ok('/9/carddavhome/', '<resourcetype><collection/></resourcetype>'), ok('/9/carddavhome/card/', `<resourcetype><collection/><addressbook ${CARD}/></resourcetype>`));
    if (req.method === 'PROPFIND') return multi(ok('/9/carddavhome/card/', '<resourcetype/>'), ...Array.from({ length: 150 }, (_x, i) => ok(`/9/carddavhome/card/${i}.vcf`, '<getcontenttype>text/vcard</getcontenttype>')));
    reports.push(req.body);
    const hrefs = [...req.body.matchAll(/<d:href>([^<]+)/g)].map((m) => m[1]);
    return multi(...hrefs.map((h, i) => ok(h, `<address-data ${CARD}>BEGIN:VCARD&#13;\nFN:${h.includes('/7.') ? 'Anna Beispiel' : `Person ${i}`}&#13;\nTEL:+49 170 55${h.includes('/7.') ? '99' : '11'}&#13;\nEND:VCARD</address-data>`)));
  });
  const byName = await run('contacts_search', { query: 'anna' });
  assert.equal(byName.total, 1); assert.equal(byName.contacts[0].name, 'Anna Beispiel');
  assert.equal(reports.length, 2);
  assert.doesNotMatch(reports[0], /PHOTO/);
  await run('contacts_search', { query: 'person' });
  assert.equal(reports.length, 2, 'second search uses the cached address book');
  assert.equal((await run('contacts_search', { query: '0170 5599'.replace('0', '') })).total, 1);
  assert.equal((await tools.TOOLS.contacts_search.handler({ query: 'a' })).isError, true);
});
