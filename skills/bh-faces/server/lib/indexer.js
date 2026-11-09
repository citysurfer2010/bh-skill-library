'use strict';
/** Works through the albums one small step at a time, so whoever drives it decides the pace. */
const { call, download } = require('../../../bh-nas/server/lib/dsm.js');
const { parseAlbum, isHidden, usable } = require('../../../bh-nas/server/lib/photo-pick.js');
const store = require('./store.js');

const ALBUM_LIST_TTL_MS = 24 * 3600_000;
const MAX_DEPTH = 2;
const MAX_FILE_BYTES = 14 * 1024 * 1024;
const ANALYZE_TIMEOUT_MS = 60_000;

const root = () => process.env.BH_NAS_PHOTO_ROOT || '/Bilder';
const list = async (dir) => (await call('SYNO.FileStation.List', 2, 'list', { folder_path: dir, limit: '3000', additional: JSON.stringify(['size', 'time']) })).files;

async function realAnalyze(body) {
  const res = await fetch(`${process.env.BH_FACES_URL}/analyze`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body, signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS) });
  if (res.status === 422) return null;
  if (!res.ok) throw new Error(`Gesichtsanalyse antwortet mit ${res.status}`);
  return res.json();
}
let analyze = realAnalyze;
const setAnalyzer = (fn) => { analyze = fn || realAnalyze; };

async function refreshAlbums() {
  if (Date.now() - Number(store.getMeta('albumsAt') || 0) < ALBUM_LIST_TTL_MS) return;
  for (const f of (await list(root())).filter((x) => x.isdir)) {
    const a = parseAlbum(f.name);
    if (a) store.upsertAlbum({ path: f.path, name: f.name, sort: a.sort, mtime: f.additional?.time?.mtime || 0 });
  }
  store.setMeta('albumsAt', Date.now());
}

async function picturesIn(dir, depth = 0) {
  const files = await list(dir); const found = files.filter(usable);
  if (depth >= MAX_DEPTH) return found;
  for (const sub of files.filter((f) => f.isdir && !isHidden(f.name))) found.push(...await picturesIn(sub.path, depth + 1));
  return found;
}

async function scan(album) {
  let added = 0;
  for (const f of await picturesIn(album.path)) if (store.addPhoto(album.path, f)) added++;
  store.markScanned(album);
  return { scanned: album.name, added };
}

async function analyzePhoto(photo) {
  let res;
  // Only the Synology's verdict on this file is final; an unreachable Synology must not write off the picture.
  try { res = await download(photo.path, MAX_FILE_BYTES + 1); } catch (e) { if (typeof e.code !== 'number') throw e; store.markPhoto(photo.path, 'error'); return { error: true }; }
  if (res.truncated || res.body[0] !== 0xFF || res.body[1] !== 0xD8) { store.markPhoto(photo.path, 'error'); return { error: true }; }
  const result = await analyze(res.body);
  if (!result) { store.markPhoto(photo.path, 'error'); return { error: true }; }
  store.saveFaces(photo.path, result.faces);
  return { faces: result.faces.length };
}

/** One step: read a new album, or analyse the next picture. New albums come first, so the queue reflects everything known. */
async function step() {
  await refreshAlbums();
  const album = store.nextAlbum();
  if (album) return scan(album);
  const photo = store.nextPending();
  if (!photo) return { done: true };
  return analyzePhoto(photo);
}

module.exports = { step, setAnalyzer };
