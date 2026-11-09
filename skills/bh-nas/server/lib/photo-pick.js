'use strict';
/** Pure selection rules for the slideshow: which folders count as albums and which pictures are shown. */
const crypto = require('crypto');

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MIN_BYTES = 150 * 1024;
const MAX_BYTES = 14 * 1024 * 1024;
const BURST_SECONDS = 5;
const BURST_SIZE_RATIO = 0.03;

const isHidden = (name) => /^[#.@]/.test(name);
const albumId = (name) => `a${crypto.createHash('sha256').update(name).digest('hex').slice(0, 12)}`;

/** Only folders that start with a year are albums; unsorted collections stay out. */
function parseAlbum(name) {
  const m = /^((?:19|20)\d{2})(.*)$/.exec(name);
  if (!m || isHidden(name)) return null;
  let rest = m[2]; let years = m[1]; let month = null;
  const range = /^-((?:19|20)\d{2})(?!\d)/.exec(rest);
  if (range) { years = `${m[1]}–${range[1]}`; rest = rest.slice(range[0].length); }
  else {
    const mm = /^[-_ ]?(0[1-9]|1[0-2])(?!\d)/.exec(rest);
    if (mm) { month = Number(mm[1]); rest = rest.slice(mm[0].length); }
  }
  const title = rest.replace(/^[-_ ]+/, '').replace(/_/g, ' ').trim();
  const when = month ? `${MONTHS[month - 1]} ${years}` : years;
  return { id: albumId(name), name, label: title || when, when: title ? when : '', sort: `${m[1]}${String(month || 0).padStart(2, '0')}` };
}

const usable = (f) => !f.isdir && !isHidden(f.name) && /\.jpe?g$/i.test(f.name) && f.additional?.size >= MIN_BYTES && f.additional.size <= MAX_BYTES;
const mtime = (f) => f.additional?.time?.mtime || 0;

/** Drops copies (same byte size, even when renamed) and burst shots (seconds apart with nearly the same size). */
function withoutDuplicates(files, seen) {
  const local = new Set(); const kept = [];
  for (const f of files.filter(usable).sort((a, b) => a.path.localeCompare(b.path))) {
    const size = f.additional.size;
    if (seen.has(size) || local.has(size)) continue;
    local.add(size);
    const prev = kept[kept.length - 1];
    const burst = prev && mtime(f) && Math.abs(mtime(f) - mtime(prev)) <= BURST_SECONDS && Math.abs(size - prev.additional.size) / size <= BURST_SIZE_RATIO;
    if (!burst) kept.push(f);
  }
  return kept;
}

/** Evenly spread over the album, so that a big album is not represented by its first evening only. */
function spread(list, n) {
  if (list.length <= n) return list.slice();
  if (n === 1) return [list[Math.floor(list.length / 2)]];
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

function shuffled(list, random = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

module.exports = { parseAlbum, albumId, usable, withoutDuplicates, spread, shuffled, isHidden };
