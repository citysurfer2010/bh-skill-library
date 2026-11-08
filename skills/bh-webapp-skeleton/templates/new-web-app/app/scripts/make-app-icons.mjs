#!/usr/bin/env node
// Zeichnet die BH-Marke in alle App-Icons, ohne Browser und ohne Abhängigkeiten.
//   node scripts/make-app-icons.mjs --out public [--color #1d4ed8]
// Die Marke sind die Buchstaben "BH" als Polygone. So sehen SVG und PNG überall gleich aus, ohne dass eine Schrift installiert sein muss.
// Ausgabe: favicon.svg, branding/nav-icon.svg, branding/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, icons.stamp.json
// Der Export wird von test/branding.test.js benutzt.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const GENERATOR = 'bh-make-app-icons v1';
export const COLOR = '#1d4ed8';
export const NAV_FILL = 'rgba(255,255,255,.18)';

const move = (dx, dy, points) => points.map(([x, y]) => [x + dx, y + dy]);
const B_X = 1.75, H_X = 12.75, TOP = 5;
// Ringe im 24er-Raster, Füllung nach Even-Odd (die Innenflächen des B sind Löcher).
export const MARK = [
  move(B_X, TOP, [[0, 0], [7, 0], [9, 2], [9, 5.5], [7.75, 7], [9.5, 8.5], [9.5, 12], [7.5, 14], [0, 14]]),
  move(B_X, TOP, [[2.8, 2.4], [6, 2.4], [6.4, 2.9], [6.4, 5], [6, 5.6], [2.8, 5.6]]),
  move(B_X, TOP, [[2.8, 8.2], [6.3, 8.2], [6.8, 8.7], [6.8, 11], [6.3, 11.6], [2.8, 11.6]]),
  move(H_X, TOP, [[0, 0], [2.8, 0], [2.8, 5.6], [6.7, 5.6], [6.7, 0], [9.5, 0], [9.5, 14], [6.7, 14], [6.7, 8.4], [2.8, 8.4], [2.8, 14], [0, 14]]),
];

/** PNG-Satz: Datei, Pixelgröße, Art, Anteil der Marke an der Kachelbreite, Eckradius in Prozent. */
export const TARGETS = [
  ['icon-192.png', 192, { kind: 'any', share: 0.85, radius: 22 }],
  ['icon-512.png', 512, { kind: 'any', share: 0.85, radius: 22 }],
  ['icon-maskable-512.png', 512, { kind: 'maskable', share: 0.72, radius: 0 }],
  ['apple-touch-icon.png', 180, { kind: 'apple', share: 0.8, radius: 0 }],
];

const n = (v) => String(Math.round(v * 100) / 100);
const markPath = () => MARK.map((ring) => `M${ring.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`).join('');

function tileSvg(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7.04" fill="${fill}"/>`
    + `<path transform="translate(2.4 2.4) scale(1.1333)" fill="#ffffff" fill-rule="evenodd" d="${markPath()}"/></svg>\n`;
}
export const buildFavicon = (color = COLOR) => tileSvg(color);
export const buildNavIcon = () => tileSvg(NAV_FILL);
export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
export const stampFor = (color = COLOR) => ({ markSha256: sha256(JSON.stringify(MARK)), color, generator: GENERATOR });

function inMark(x, y) {
  let inside = false;
  for (const ring of MARK) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function inRoundedRect(x, y, size, r) {
  if (!r) return true;
  const cx = Math.max(r, Math.min(size - r, x)), cy = Math.max(r, Math.min(size - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Rendert ein Ziel mit 4x4-Abtastung; ohne Alpha (RGB), wenn die Kachel randlos ist. */
export function renderPng(size, { kind, share, radius }, color = COLOR) {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const alpha = kind === 'any';
  const cornerR = (size * radius) / 100;
  const unit = (size * share) / 24, off = (size - 24 * unit) / 2;
  const bpp = alpha ? 4 : 3, SS = 4;
  const raw = Buffer.alloc((size * bpp + 1) * size);
  for (let py = 0; py < size; py++) {
    let o = py * (size * bpp + 1) + 1;
    for (let px = 0; px < size; px++) {
      let tile = 0, mark = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS, y = py + (sy + 0.5) / SS;
          if (!inRoundedRect(x, y, size, cornerR)) continue;
          tile++;
          if (inMark((x - off) / unit, (y - off) / unit)) mark++;
        }
      }
      const m = tile ? mark / tile : 0;
      for (let c = 0; c < 3; c++) raw[o++] = Math.round(rgb[c] + (255 - rgb[c]) * m);
      if (alpha) raw[o++] = Math.round((255 * tile) / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

export function main() {
  const out = arg('out');
  if (!out) { console.error('Aufruf: make-app-icons.mjs --out <public-Ordner> [--color #1d4ed8]'); process.exit(2); }
  const color = arg('color', COLOR);
  const brand = path.join(out, 'branding');
  fs.mkdirSync(brand, { recursive: true });
  fs.writeFileSync(path.join(out, 'favicon.svg'), buildFavicon(color));
  fs.writeFileSync(path.join(brand, 'nav-icon.svg'), buildNavIcon());
  fs.writeFileSync(path.join(brand, 'icons.stamp.json'), `${JSON.stringify(stampFor(color), null, 2)}\n`);
  for (const [file, px, o] of TARGETS) {
    fs.writeFileSync(path.join(brand, file), renderPng(px, o, color));
    console.log('Icon', file, `${px}x${px}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
