'use strict';
/** The picture stream: one session at a time, fetched one picture at a time so the Synology stays relaxed. */
const { call, download } = require('./dsm.js');
const { parseAlbum, isHidden, withoutDuplicates, spread, shuffled } = require('./photo-pick.js');

const ALBUM_MAX = 60;
const PER_RANDOM_ALBUM = 12;
const ALBUMS_TTL_MS = 6 * 3600_000;
const MAX_DEPTH = 2;
const MAX_TRIES = 8;
const MAX_FILE_BYTES = 14 * 1024 * 1024;

const root = () => process.env.BH_NAS_PHOTO_ROOT || '/Bilder';
const list = async (dir) => (await call('SYNO.FileStation.List', 2, 'list', { folder_path: dir, limit: '2000', additional: JSON.stringify(['size', 'time']) })).files;

async function realSink(photo) {
  const res = await fetch(`${process.env.BH_AUTH_INTERNAL}/screen-photo`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.BH_SCREEN_WRITE}` }, body: JSON.stringify(photo), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Anzeige lehnt das Bild ab (${res.status})`);
}
let sink = realSink;
let albumsCache = null; let albumsAt = 0;
let session = null;
const reset = (s) => { sink = s || realSink; albumsCache = null; albumsAt = 0; session = null; };

async function albums() {
  if (albumsCache && Date.now() - albumsAt < ALBUMS_TTL_MS) return albumsCache;
  const parsed = (await list(root())).filter((f) => f.isdir).map((f) => { const a = parseAlbum(f.name); return a && { ...a, path: f.path }; }).filter(Boolean);
  albumsCache = parsed.sort((a, b) => b.sort.localeCompare(a.sort) || a.label.localeCompare(b.label, 'de'));
  albumsAt = Date.now();
  return albumsCache;
}

async function picturesIn(dir, depth = 0) {
  const files = await list(dir); const found = files.filter((f) => !f.isdir);
  if (depth >= MAX_DEPTH) return found;
  for (const sub of files.filter((f) => f.isdir && !isHidden(f.name))) found.push(...await picturesIn(sub.path, depth + 1));
  return found;
}

async function fill(s, album, count) {
  const chosen = spread(withoutDuplicates(await picturesIn(album.path), s.seen), count);
  chosen.forEach((f) => s.seen.add(f.additional.size));
  s.queue.push(...chosen.map((f) => ({ path: f.path, caption: album.when ? `${album.label} · ${album.when}` : album.label })));
}

async function open(start) {
  const all = await albums();
  const album = start === 'all' ? null : all.find((a) => a.id === start);
  if (start !== 'all' && !album) throw new Error('Album nicht gefunden');
  const s = { album, queue: [], bag: album ? [] : shuffled(all), seen: new Set(), shown: 0 };
  if (album) await fill(s, album, ALBUM_MAX);
  return s;
}

/** Next queue entry; in "all albums" mode the bag refills so that the stream never ends. */
async function nextEntry(s) {
  for (let i = 0; !s.queue.length && !s.album && i < MAX_TRIES; i++) {
    if (!s.bag.length) { s.bag = shuffled(await albums()); s.seen = new Set(); }
    await fill(s, s.bag.pop(), PER_RANDOM_ALBUM);
  }
  return s.queue.shift() || null;
}

async function pushNext(start) {
  if ((start && start !== 'next') || !session) { session = null; session = await open(start && start !== 'next' ? start : 'all'); }
  const s = session;
  for (let i = 0; i < MAX_TRIES; i++) {
    const entry = await nextEntry(s);
    if (!entry) { await sink({ done: true, empty: !s.shown }); return { done: true, shown: s.shown }; }
    let res;
    try { res = await download(entry.path, MAX_FILE_BYTES + 1); } catch { continue; }
    if (res.truncated || res.body[0] !== 0xFF || res.body[1] !== 0xD8) continue;
    if (session !== s) return { stale: true };
    await sink({ data: res.body.toString('base64'), caption: entry.caption });
    s.shown++;
    return { caption: entry.caption };
  }
  throw new Error('Die Synology liefert gerade keine Bilder');
}

module.exports = { albums, pushNext, reset };
