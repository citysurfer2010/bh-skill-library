'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
process.env.HOME = dir; process.env.BH_ICLOUD_SYNC_DB = path.join(dir, 's.db'); process.env.BH_ICLOUD_INBOX = path.join(dir, 'in');
fs.mkdirSync(path.join(dir, '.config/bh-nas'), { recursive: true });
fs.writeFileSync(path.join(dir, '.config/bh-nas/.env'), 'BH_NAS_USER=a\nBH_NAS_PASSWORD=b\n');
const dsm = require('../../../bh-nas/server/lib/dsm.js');
const sync = require('../lib/sync.js');
const json = (o) => ({ type: 'application/json', body: Buffer.from(JSON.stringify(o)), truncated: false });
const put = (rel, mtime = 1000) => { const f = path.join(process.env.BH_ICLOUD_INBOX, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); fs.utimesSync(f, mtime, mtime); return f; };
function setup(reply) {
  sync.close(); fs.rmSync(process.env.BH_ICLOUD_SYNC_DB, { force: true }); fs.rmSync(process.env.BH_ICLOUD_INBOX, { recursive: true, force: true }); fs.mkdirSync(process.env.BH_ICLOUD_INBOX);
  const seen = [];
  dsm.setTransport(async () => json({ success: true, data: { sid: 'S' } }));
  dsm.setUploadTransport(async (q, f, file) => { seen.push({ q, f, name: file.name }); return reply(seen); });
  return seen;
}

test('Upload: fester Zielordner, nie ueberschreiben, halbe Dateien bleiben', async () => {
  const seen = setup(() => ({ success: true }));
  put('2026/2026-11/IMG_1.HEIC'); put('2026/2026-11/IMG_2.HEIC.part'); put('anderswo/x.jpg');
  assert.deepEqual(await sync.step(), { uploaded: true });
  assert.deepEqual(await sync.step(), { done: true, removedLocal: 0 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].f.path, '/photo/iCloud-Matti/2026/2026-11'); assert.equal(seen[0].f.overwrite, 'false'); assert.equal(seen[0].name, 'IMG_1.HEIC');
});

test('Upload: Vorhandenes zaehlt als erledigt, andere Fehler bleiben offen', async () => {
  setup(() => ({ success: false, error: { code: 1805 } }));
  put('2026/2026-11/a.jpg');
  assert.deepEqual(await sync.step(), { existed: true });
  setup(() => ({ success: false, error: { code: 408 } }));
  put('2026/2026-11/b.jpg');
  await assert.rejects(sync.step(), /408/);
  assert.equal(sync.counts().open, 1);
});

test('Aufraeumen: nur Hochgeladenes jenseits der neuesten 700', async () => {
  setup(() => ({ success: true }));
  const oldest = put('2020/2020-01/alt.jpg', 500);
  for (let i = 0; i < 700; i++) put(`2026/2026-11/n${i}.jpg`, 2000 + i);
  for (let i = 0; i < 701; i++) await sync.step();
  const end = await sync.step();
  assert.equal(end.removedLocal, 1); assert.equal(fs.existsSync(oldest), false);
  const keep = put('2019/2019-01/offen.jpg', 400);
  await assert.deepEqual(sync.counts().open, 1); assert.equal(fs.existsSync(keep), true);
});
