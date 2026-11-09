#!/usr/bin/env node
// Draws the app's own icon in the platform style: blue gradient tile with a white motif, without a browser or dependencies.
//   node scripts/make-app-icons.mjs --out public
// The motif comes from scripts/app-icon.json: an SVG path on a 64-unit grid, centred on 32,32, about 32 to 38 units wide.
// Output: favicon.svg, branding/nav-icon.svg, branding/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, icons.stamp.json
// The export is used by test/branding.test.js.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const GENERATOR = 'bh-make-app-icons v3';
export const GRADIENT = ['#172554', '#2563eb'];
export const NAV_FILL = 'rgba(255,255,255,.18)';
const ICON = JSON.parse(fs.readFileSync(new URL('./app-icon.json', import.meta.url), 'utf8'));
export const MARK_PATH = ICON.path;
const GRID = 64;
const CURVE_STEPS = 16;

// Turns the SVG path into polygon rings; the even-odd rule makes the inner areas of the B holes.
function flatten(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g);
  const rings = []; let ring = null; let x = 0, y = 0, cx = 0, cy = 0, cmd = '', i = 0;
  const num = () => Number(tokens[i++]);
  const curve = (x1, y1, x2, y2, ex, ey) => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS, u = 1 - t;
      ring.push([u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * ex, u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * ey]);
    }
    cx = x2; cy = y2; x = ex; y = ey;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': x = ox + num(); y = oy + num(); ring = [[x, y]]; rings.push(ring); break;
      case 'L': x = ox + num(); y = oy + num(); ring.push([x, y]); break;
      case 'H': x = ox + num(); ring.push([x, y]); break;
      case 'V': y = oy + num(); ring.push([x, y]); break;
      case 'C': { const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]; curve(...a); break; }
      case 'S': { const x1 = 2 * x - cx, y1 = 2 * y - cy; const a = [ox + num(), oy + num(), ox + num(), oy + num()]; curve(x1, y1, ...a); break; }
      case 'Z': break;
      default: throw new Error(`Unsupported path command ${cmd}`);
    }
    cx = ['C', 'S'].includes(cmd.toUpperCase()) ? cx : x;
    cy = ['C', 'S'].includes(cmd.toUpperCase()) ? cy : y;
  }
  return rings;
}
export const MARK = flatten(MARK_PATH);

/** PNG set: file, pixel size, kind, scale of the logo, corner radius in percent. */
export const TARGETS = [
  ['icon-192.png', 192, { kind: 'any', scale: 1, radius: 25 }],
  ['icon-512.png', 512, { kind: 'any', scale: 1, radius: 25 }],
  ['icon-maskable-512.png', 512, { kind: 'maskable', scale: 0.8, radius: 0 }],
  ['apple-touch-icon.png', 180, { kind: 'apple', scale: 1, radius: 0 }],
];

const markTag = `<path fill="#fff" fill-rule="evenodd" d="${MARK_PATH}"/>`;
export const buildFavicon = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${ICON.label}"><defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${GRADIENT[0]}"/><stop offset="1" stop-color="${GRADIENT[1]}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#t)"/>${markTag}</svg>\n`;
export const buildNavIcon = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${NAV_FILL}"/>${markTag}</svg>\n`;
export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
export const stampFor = () => ({ markSha256: sha256(MARK_PATH), gradient: GRADIENT, generator: GENERATOR });

const BOUNDS = MARK.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [GRID, GRID, 0, 0]);

function inMark(x, y) {
  if (x < BOUNDS[0] || y < BOUNDS[1] || x > BOUNDS[2] || y > BOUNDS[3]) return false; // Saves most of the polygon tests.
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

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Renders a target with 4x4 sampling; without alpha (RGB) if the tile is borderless. */
export function renderPng(size, { kind, scale, radius }) {
  const [from, to] = GRADIENT.map(hex);
  const alpha = kind === 'any';
  const cornerR = (size * radius) / 100;
  const unit = (size * scale) / GRID, off = (size - GRID * unit) / 2;
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
      const g = (px + py + 1) / (2 * size); // Diagonal gradient, as in the logo.
      for (let c = 0; c < 3; c++) { const base = from[c] + (to[c] - from[c]) * g; raw[o++] = Math.round(base + (255 - base) * m); }
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
  if (!out) { console.error('Aufruf: make-app-icons.mjs --out <public-Ordner>'); process.exit(2); }
  const brand = path.join(out, 'branding');
  fs.mkdirSync(brand, { recursive: true });
  fs.writeFileSync(path.join(out, 'favicon.svg'), buildFavicon());
  fs.writeFileSync(path.join(brand, 'nav-icon.svg'), buildNavIcon());
  fs.writeFileSync(path.join(brand, 'icons.stamp.json'), `${JSON.stringify(stampFor(), null, 2)}\n`);
  for (const [file, px, o] of TARGETS) {
    fs.writeFileSync(path.join(brand, file), renderPng(px, o));
    console.log('Icon', file, `${px}x${px}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
