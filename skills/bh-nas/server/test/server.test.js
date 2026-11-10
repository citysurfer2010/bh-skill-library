'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-'));
const dsm = require('../lib/dsm.js');
const json = (o) => ({ type: 'application/json', body: Buffer.from(JSON.stringify(o)), truncated: false });
const text = (r) => r.content[0].text;
function connect() {
  const d = path.join(process.env.HOME, '.config/bh-nas'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '.env'), 'BH_NAS_USER=anna\nBH_NAS_PASSWORD=ge=heim\n');
}
function fake(handler) {
  connect();
  const seen = [];
  dsm.setTransport(async (p, opts) => { seen.push({ ...p, opts }); return p.method === 'login' ? json({ success: true, data: { sid: 'S' + seen.length } }) : handler(p, seen, opts); });
  return seen;
}

test('nur Lesewerkzeuge', () => {
  assert.deepEqual([...require('../tools/index.js').TOOL_NAMES].sort(), ['health', 'list', 'list_shares', 'read_text', 'search']);
});

test('ohne Verbindung klare Meldung', async () => {
  dsm.setTransport(async () => assert.fail('kein Aufruf erwartet'));
  assert.match(text(await require('../tools/nas/list-shares.js').handler({})), /noch nicht verbunden/);
});

test('Anmeldung nutzt das Konto des Users', async () => {
  const seen = fake(() => json({ success: true, data: { shares: [] } }));
  await require('../tools/nas/list-shares.js').handler({});
  assert.equal(seen[0].account, 'anna'); assert.equal(seen[0].passwd, 'ge=heim');
});

test('TLS: Zertifikat wird exakt verglichen und bleibt pruefpflichtig', () => {
  process.env.BH_NAS_FP = 'AA:BB'; process.env.BH_NAS_CA_B64 = Buffer.from('PEM').toString('base64');
  const o = dsm.tlsOptions();
  assert.equal(o.ca, 'PEM'); assert.equal(o.rejectUnauthorized, undefined);
  assert.equal(o.checkServerIdentity('x', { fingerprint256: 'AA:BB' }), undefined);
  assert.ok(o.checkServerIdentity('x', { fingerprint256: 'CC:DD' }) instanceof Error);
});

test('Pfade: nur absolut und ohne Ausbruch', () => {
  for (const bad of ['Backup', '/a/../b', '', null, '/a\nb']) assert.throws(() => dsm.checkPath(bad), /Pfad/);
});

test('abgelaufene Sitzung: einmal neu anmelden', async () => {
  let n = 0;
  const seen = fake(() => (++n === 1 ? json({ success: false, error: { code: 119 } }) : json({ success: true, data: { shares: [{ name: 'A', path: '/A' }] } })));
  const r = await require('../tools/nas/list-shares.js').handler({});
  assert.deepEqual(JSON.parse(text(r)), [{ name: 'A', path: '/A' }]);
  assert.equal(seen.filter((s) => s.method === 'login').length, 2);
});

test('Fehler der Synology werden lesbar gemeldet', async () => {
  fake(() => json({ success: false, error: { code: 408 } }));
  const r = await require('../tools/nas/list.js').handler({ path: '/fehlt' });
  assert.equal(r.isError, true); assert.match(text(r), /nicht gefunden/);
});

test('Lesen: Grenze, Kuerzung, keine Binaerdateien', async () => {
  const read = require('../tools/nas/read-text.js');
  const seen = fake(() => ({ type: 'text/plain', body: Buffer.from('hallo'), truncated: true }));
  const r = JSON.parse(text(await read.handler({ path: '/a.txt' })));
  assert.equal(r.inhalt, 'hallo'); assert.equal(r.gekuerzt, true); assert.equal(seen.at(-1).opts.limit, 256 * 1024);
  fake(() => ({ type: 'application/octet-stream', body: Buffer.from([1, 0, 2]), truncated: false }));
  assert.match(text(await read.handler({ path: '/a.jpg' })), /keine Textdatei/);
});

test('Suche raeumt ihre Aufgabe auf', async () => {
  const seen = fake((p) => (p.method === 'start' ? json({ success: true, data: { taskid: 'T' } }) : p.method === 'list' ? json({ success: true, data: { finished: true, total: 1, files: [{ name: 'a.pdf', path: '/a.pdf', isdir: false }] } }) : json({ success: true, data: {} })));
  const r = JSON.parse(text(await require('../tools/nas/search.js').handler({ path: '/x', pattern: '*.pdf' })));
  assert.equal(r.files[0].name, 'a.pdf');
  assert.deepEqual(seen.filter((s) => ['stop', 'clean'].includes(s.method)).map((s) => s.method), ['stop', 'clean']);
});

test('Fehlendes Zertifikat: verstaendliche Meldung statt TLS-Fehler', async () => {
  connect();
  dsm.setTransport(async () => { throw Object.assign(new Error('unable to verify'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }); });
  const r = await require('../tools/nas/list-shares.js').handler({});
  assert.equal(r.isError, true); assert.match(text(r), /LIMITATIONS/);
});


const pick = require('../lib/photo-pick.js');
const { summarize } = require('../lib/health.js');
const photo = (name, size, mtime = 0) => ({ name, path: `/B/a/${name}`, isdir: false, additional: { size, time: { mtime } } });
const KB = 1024;

test('Alben: nur mit Jahreszahl, Beschriftung lesbar', () => {
  assert.equal(pick.parseAlbum('Finn_Unsortiert'), null);
  assert.equal(pick.parseAlbum('#recycle'), null);
  const a = pick.parseAlbum('2006_07 Ägypten');
  assert.equal(a.label, 'Ägypten'); assert.equal(a.when, 'Juli 2006');
  assert.equal(pick.parseAlbum('2005-2006 Winter').when, '2005–2006');
  assert.equal(pick.parseAlbum('2006-11 Geb').label, 'Geb');
  assert.equal(pick.parseAlbum('2007 Sonstiges').when, '2007');
  assert.match(a.id, /^a[0-9a-f]{12}$/);
});

test('Auswahl: keine Kopien, auch umbenannt und albenübergreifend', () => {
  const seen = new Set([900 * KB]);
  const kept = pick.withoutDuplicates([photo('a.jpg', 500 * KB), photo('kopie-von-a.JPG', 500 * KB), photo('alt.jpg', 900 * KB), photo('b.jpg', 700 * KB)], seen);
  assert.deepEqual(kept.map((f) => f.name), ['a.jpg', 'b.jpg']);
});

test('Auswahl: Serienbilder, Vorschauen und fremde Formate fallen weg', () => {
  const kept = pick.withoutDuplicates([photo('1.jpg', 1000 * KB, 100), photo('2.jpg', 1010 * KB, 102), photo('3.jpg', 1500 * KB, 103), photo('klein.jpg', 20 * KB), photo('x.png', 900 * KB), photo('y.db', 900 * KB), photo('.z.jpg', 900 * KB)], new Set());
  assert.deepEqual(kept.map((f) => f.name), ['1.jpg', '3.jpg']);
});

test('Auswahl: grosse Alben gleichmaessig verteilt', () => {
  const list = Array.from({ length: 100 }, (_, i) => i);
  const s = pick.spread(list, 5);
  assert.equal(s.length, 5); assert.equal(s[0], 0); assert.equal(s[4], 99);
  assert.equal(new Set(s).size, 5);
  assert.deepEqual(pick.spread([1, 2], 5), [1, 2]);
});

function fakeNas(albums) {
  connect();
  dsm.setTransport(async (p) => {
    if (p.method === 'login') return json({ success: true, data: { sid: 'S' } });
    if (p.api === 'SYNO.FileStation.Download') return { type: 'image/jpeg', body: Buffer.from([0xFF, 0xD8, 1]), truncated: false };
    if (p.folder_path === '/Bilder') return json({ success: true, data: { files: Object.keys(albums).map((n) => ({ name: n, path: `/Bilder/${n}`, isdir: true })) } });
    const n = p.folder_path.replace('/Bilder/', '');
    return json({ success: true, data: { files: albums[n].map((f) => ({ ...f, path: `/Bilder/${n}/${f.name}` })) } });
  });
}

test('Slideshow: Album laeuft ohne Doppelte und endet', async () => {
  const photos = require('../lib/photos.js'); const got = [];
  photos.reset(async (p) => { got.push(p); });
  fakeNas({ '2006_07 Ägypten': [photo('a.jpg', 500 * KB), photo('b.jpg', 500 * KB), photo('c.jpg', 800 * KB)] });
  const [album] = await photos.albums();
  await photos.pushNext(album.id); await photos.pushNext('next');
  const end = await photos.pushNext('next');
  assert.deepEqual(end, { done: true, shown: 2 });
  assert.equal(got.length, 3); assert.equal(got[0].caption, 'Ägypten · Juli 2006'); assert.equal(got[2].done, true);
  assert.equal(got[0].data, Buffer.from([0xFF, 0xD8, 1]).toString('base64'));
});

test('Slideshow: ein Album ohne Fotos wird als leer gemeldet', async () => {
  const photos = require('../lib/photos.js'); const got = [];
  photos.reset(async (p) => { got.push(p); });
  fakeNas({ '2001 Leer': [photo('x.db', 900 * KB)] });
  const [album] = await photos.albums();
  await photos.pushNext(album.id);
  assert.deepEqual(got, [{ done: true, empty: true }]);
});

test('Slideshow: Ergebnis enthaelt nie Bilddaten, unbekanntes Album wird abgelehnt', async () => {
  const photos = require('../lib/photos.js');
  photos.reset(async () => {});
  fakeNas({ '2006 A': [photo('a.jpg', 500 * KB)] });
  assert.deepEqual(await photos.pushNext('all'), { caption: 'A · 2006' });
  await assert.rejects(photos.pushNext('a000000000000'), /nicht gefunden/);
});

test('Zustand: Warnungen und keine Seriennummern', () => {
  const r = summarize({ system: { model: 'DS', firmware_ver: 'x', sys_temp: 40, sys_tempwarn: false, up_time: '12:00:00', serial: 'GEHEIM' },
    storage: { volumes: [{ id: 'v1', status: 'normal', size: { total: '100', used: '90' } }], storagePools: [{ id: 'p', status: 'normal' }], disks: [{ id: 'sda', status: 'normal', smart_status: 'failing', temp: 60, serial: 'GEHEIM' }] },
    backups: { total: 0 }, upgrade: { available: true, version: 'DSM 9' } });
  assert.equal(JSON.stringify(r).includes('GEHEIM'), false);
  assert.equal(r.warnings.length, 4);
  assert.deepEqual(r.update, { available: true, version: 'DSM 9' });
  const fine = summarize({ system: { sys_temp: 40, up_time: '1:0:0' }, storage: { volumes: [], storagePools: [], disks: [{ id: 'a', status: 'normal', smart_status: 'normal', temp: 35 }] }, backups: { total: 1 }, upgrade: null });
  assert.deepEqual(fine.warnings, []); assert.equal(fine.update, null);
});

test('Slideshow: Jahr spielt nur Alben dieses Jahres', async () => {
  const photos = require('../lib/photos.js'); const got = [];
  photos.reset(async (p) => { got.push(p); });
  fakeNas({ '2006 A': [photo('a.jpg', 500 * KB)], '2007 B': [photo('b.jpg', 600 * KB)] });
  assert.equal((await photos.albums()).find((a) => a.label === 'A').year, '2006');
  assert.deepEqual(await photos.pushNext('y2007'), { caption: 'B · 2007' });
  await assert.rejects(photos.pushNext('y1999'), /nicht gefunden/);
});
