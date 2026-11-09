'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faces-'));
process.env.HOME = dir; process.env.BH_FACES_DB = path.join(dir, 'f.db');
fs.mkdirSync(path.join(dir, '.config/bh-nas'), { recursive: true });
fs.writeFileSync(path.join(dir, '.config/bh-nas/.env'), 'BH_NAS_USER=a\nBH_NAS_PASSWORD=b\n');

const dsm = require('../../../bh-nas/server/lib/dsm.js');
const store = require('../lib/store.js');
const indexer = require('../lib/indexer.js');

const KB = 1024; const JPEG = Buffer.from([0xFF, 0xD8, 1]);
const json = (o) => ({ type: 'application/json', body: Buffer.from(JSON.stringify(o)), truncated: false });
const img = (name, size) => ({ name, isdir: false, additional: { size, time: { mtime: 5 } } });
const fp = Buffer.alloc(128 * 4, 1).toString('base64');

function nas(tree, downloads = []) {
  dsm.setTransport(async (p) => {
    if (p.method === 'login') return json({ success: true, data: { sid: 'S' } });
    if (p.api === 'SYNO.FileStation.Download') { downloads.push(p.path); return { type: 'image/jpeg', body: JPEG, truncated: false }; }
    return json({ success: true, data: { files: (tree[p.folder_path] || []).map((f) => ({ ...f, path: `${p.folder_path}/${f.name}` })) } });
  });
}
const reset = () => { store.close(); for (const s of ['', '-wal', '-shm']) fs.rmSync(process.env.BH_FACES_DB + s, { force: true }); };

test('Index: nur Alben mit Jahreszahl, Kopien nur einmal, Ende wird gemeldet', async () => {
  reset();
  const dl = [];
  nas({ '/Bilder': [{ name: '2006_07 Ä', isdir: true, additional: { time: { mtime: 9 } } }, { name: 'Finn_Unsortiert', isdir: true, additional: { time: { mtime: 9 } } }],
    '/Bilder/2006_07 Ä': [img('a.jpg', 500 * KB), img('kopie.jpg', 500 * KB), img('b.jpg', 800 * KB), img('x.png', 800 * KB)] }, dl);
  indexer.setAnalyzer(async () => ({ faces: [{ box: [0, 0, 1, 1], score: 0.9, sharpness: 50, fingerprint: fp, crop: JPEG.toString('base64') }] }));
  assert.deepEqual(await indexer.step(), { scanned: '2006_07 Ä', added: 2 });
  assert.deepEqual(await indexer.step(), { faces: 1 });
  assert.deepEqual(await indexer.step(), { faces: 1 });
  assert.deepEqual(await indexer.step(), { done: true });
  const c = store.counts();
  assert.deepEqual(c.photos, { pending: 0, done: 2, duplicate: 1, error: 0 });
  assert.equal(c.faces, 2); assert.equal(c.albums, 1); assert.equal(dl.length, 2);
});

test('Index: kaputtes Bild wird uebersprungen, ausgefallene Analyse bleibt offen', async () => {
  reset();
  nas({ '/Bilder': [{ name: '2010 A', isdir: true, additional: { time: { mtime: 1 } } }], '/Bilder/2010 A': [img('a.jpg', 500 * KB)] });
  await (indexer.setAnalyzer(async () => { throw new Error('weg'); }), indexer.step());
  await assert.rejects(indexer.step(), /weg/);
  assert.equal(store.counts().photos.pending, 1);
  indexer.setAnalyzer(async () => null);
  assert.deepEqual(await indexer.step(), { error: true });
  assert.equal(store.counts().photos.error, 1);
});

test('Werkzeuge geben nie Fingerabdruecke oder Gesichter zurueck', () => {
  assert.deepEqual([...require('../tools/index.js').TOOL_NAMES].sort(), ['index_step', 'status']);
});
