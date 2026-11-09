'use strict';
/**
 * Ratchet: App-Icon, Favicon, Navbar-Icon und Benutzermenü. Alles kommt aus scripts/make-app-icons.mjs,
 * die Marke sind die Buchstaben „BH“ auf der blauen Kachel. Der PNG-Decoder liest echte Pixel ohne Abhängigkeiten.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const APP = path.join(__dirname, '..');
const PUB = path.join(APP, 'public');
const BRAND = path.join(PUB, 'branding');
const BLUE = [29, 78, 216];
const THEME = '#1d4ed8';
const read = (f) => fs.readFileSync(f, 'utf8');
const gen = () => import(pathToFileURL(path.join(APP, 'scripts', 'make-app-icons.mjs')).href);

function decodePng(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file}: kein PNG`);
  let w = 0, h = 0, type = 0;
  const idat = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o), kind = b.toString('latin1', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; assert.equal(data[8], 8); assert.equal(data[12], 0); }
    if (kind === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x], a = x >= bpp ? px[y * stride + x - bpp] : 0, u = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      px[y * stride + x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? u : c))) & 255;
    }
  }
  return { w, h, type, at: (x, y) => { const i = y * stride + x * bpp; return { r: px[i], g: px[i + 1], b: px[i + 2], a: bpp === 4 ? px[i + 3] : 255 }; } };
}
const isBlue = (p) => p.r === BLUE[0] && p.g === BLUE[1] && p.b === BLUE[2] && p.a === 255;
const isWhite = (p) => p.a > 200 && p.r > 235 && p.g > 235 && p.b > 235;
function markBox(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (isWhite(img.at(x, y))) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
const htmlPages = () => fs.readdirSync(PUB).filter((f) => f.endsWith('.html')).map((f) => path.join(PUB, f));

test('favicon.svg und nav-icon.svg sind exakt die Ausgabe des Generators', async () => {
  const { buildFavicon, buildNavIcon } = await gen();
  assert.equal(read(path.join(PUB, 'favicon.svg')), buildFavicon(), 'favicon.svg weicht ab: scripts/make-app-icons.mjs laufen lassen');
  assert.equal(read(path.join(BRAND, 'nav-icon.svg')), buildNavIcon(), 'nav-icon.svg weicht ab');
});

test('icons.stamp.json passt zum aktuellen Generator', async () => {
  const { stampFor } = await gen();
  assert.deepEqual(JSON.parse(read(path.join(BRAND, 'icons.stamp.json'))), stampFor());
});

test('PNG-Icons sind byte-genau die Ausgabe des Generators', async () => {
  const { TARGETS, renderPng } = await gen();
  const [file, size, opts] = TARGETS.find(([f]) => f === 'apple-touch-icon.png');
  assert.ok(fs.readFileSync(path.join(BRAND, file)).equals(renderPng(size, opts)));
});

test('Icons: Größe, Kachelfarbe, Marke weiß und mittig, sichere Zone', () => {
  for (const [file, size, any] of [['icon-192.png', 192, true], ['icon-512.png', 512, true], ['icon-maskable-512.png', 512, false], ['apple-touch-icon.png', 180, false]]) {
    const img = decodePng(path.join(BRAND, file));
    assert.deepEqual([img.w, img.h], [size, size], `${file}: Größe`);
    assert.equal(img.type, any ? 6 : 2, `${file}: Farbtyp`);
    if (any) {
      assert.equal(img.at(0, 0).a, 0, `${file}: Ecke muss transparent sein`);
      assert.ok(isBlue(img.at(img.w >> 1, 1)), `${file}: Kachelrand`);
    } else {
      for (const [x, y] of [[0, 0], [img.w - 1, 0], [0, img.h - 1], [img.w - 1, img.h - 1], [img.w >> 1, 2]]) assert.ok(isBlue(img.at(x, y)), `${file}: randlos blau bei ${x},${y}`);
    }
    const box = markBox(img), share = (box.x1 - box.x0 + 1) / img.w;
    assert.ok(box.x1 > 0 && share > 0.3 && share < 0.8, `${file}: Marke ${(share * 100).toFixed(0)} % breit`);
    assert.ok(Math.abs((box.x0 + box.x1) / 2 - img.w / 2) < img.w * 0.04 && Math.abs((box.y0 + box.y1) / 2 - img.h / 2) < img.h * 0.04, `${file}: Marke nicht mittig`);
    if (file.includes('maskable')) {
      for (const [x, y] of [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]]) assert.ok(Math.hypot(x - img.w / 2, y - img.h / 2) <= img.w * 0.4, 'maskable: Marke außerhalb der sicheren Zone');
    }
  }
});

test('jede HTML-Seite: genau ein rel=icon, apple-touch-icon, Manifest, theme-color', () => {
  const errs = [];
  for (const f of htmlPages()) {
    const s = read(f).replace(/<!--[\s\S]*?-->/g, ''), rel = path.relative(APP, f);
    const icons = s.match(/<link[^>]*rel="icon"[^>]*>/g) || [];
    if (icons.length !== 1) errs.push(`${rel}: ${icons.length} rel=icon`);
    else if (!/favicon\.svg/.test(icons[0]) || /media=/.test(icons[0])) errs.push(`${rel}: rel=icon muss favicon.svg ohne media sein`);
    if (!/rel="apple-touch-icon"[^>]*apple-touch-icon\.png/.test(s)) errs.push(`${rel}: apple-touch-icon fehlt`);
    if (!/rel="manifest"/.test(s)) errs.push(`${rel}: Manifest fehlt`);
    if (!new RegExp(`name="theme-color"\\s+content="${THEME}"`, 'i').test(s)) errs.push(`${rel}: theme-color fehlt`);
    if (!/\?v=/.test(s)) errs.push(`${rel}: Icons brauchen ?v=`);
  }
  assert.deepEqual(errs, [], `\n${errs.join('\n')}`);
});

test('Manifest: SVG, 192/512 any, 512 maskable, Hintergrund und Theme blau', () => {
  const m = JSON.parse(read(path.join(PUB, 'manifest.webmanifest'))), icons = m.icons || [];
  const has = (sizes, purpose, src) => icons.some((i) => i.sizes === sizes && i.purpose === purpose && String(i.src).includes(src));
  assert.ok(has('any', 'any', 'favicon.svg'));
  assert.ok(has('192x192', 'any', 'icon-192.png') && has('512x512', 'any', 'icon-512.png'));
  assert.ok(has('512x512', 'maskable', 'icon-maskable-512.png'));
  assert.equal(m.theme_color, THEME);
  assert.equal(m.background_color, THEME);
});

test('Navbar: [Kachel] App-Name und Benutzermenü', () => {
  const nav = read(path.join(PUB, 'components', 'navbar.js'));
  assert.match(nav, /branding\/nav-icon\.svg/);
  assert.match(nav, /width="24" height="24"/);
  assert.match(nav, /s\.setUser\(/);
  const app = /app:\s*\{\s*name:\s*'([^']+)'/.exec(nav);
  assert.ok(app && app[1].length > 1, 'App-Name fehlt');
  assert.match(read(path.join(PUB, 'components', 'bh-app-shell.js')), /BHUserMenu\.mount\(/);
});

test('Marken-Dateien sind ohne Anmeldung erreichbar', () => {
  const s = read(path.join(APP, 'server.js'));
  assert.match(s, /startsWith\('\/branding\/'\)/);
  assert.match(s, /manifest\.webmanifest/);
});
