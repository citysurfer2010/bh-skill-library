/** Minimal WebDAV client for iCloud CalDAV and CardDAV. Credentials only ever go to icloud.com over https. */
'use strict';

const https = require('https');
const { credentials, markRejected, RECONNECT } = require('./credentials.js');

const RESPONSE_LIMIT = 24 * 1024 * 1024;
const MAX_REDIRECTS = 4;

function realRequest(url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, timeout: 45_000, headers: { ...headers, 'content-length': Buffer.byteLength(body) } }, (res) => {
      const parts = []; let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > RESPONSE_LIMIT) { req.destroy(new Error('Antwort von iCloud ist zu gross')); return; }
        parts.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body: Buffer.concat(parts).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('iCloud antwortet nicht')));
    req.on('error', reject);
    req.end(body);
  });
}

let transport = realRequest;
const setTransport = (fn) => { transport = fn; homes.clear(); };

function safeUrl(href, base) {
  const url = new URL(href, base);
  if (url.protocol !== 'https:' || !/(^|\.)icloud\.com$/i.test(url.hostname)) throw new Error('iCloud verweist auf eine fremde Adresse');
  return url;
}

// Redirects are followed by hand: fetch-style clients drop the login when iCloud switches to its partition host.
async function dav(method, url, xml, depth) {
  const { appleId, password } = credentials('dav');
  const authorization = `Basic ${Buffer.from(`${appleId}:${password}`).toString('base64')}`;
  let target = safeUrl(url);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await transport(target, { method, body: xml, headers: { authorization, depth, 'content-type': 'application/xml; charset=utf-8', 'user-agent': 'bh-icloud' } });
    if ([301, 302, 307, 308].includes(r.status) && r.location) { target = safeUrl(r.location, target); continue; }
    if (r.status === 401) { markRejected('dav'); throw new Error(`iCloud lehnt die Anmeldung ab, das app-spezifische Passwort ist abgelaufen oder widerrufen: ${RECONNECT}`); }
    if (r.status !== 207) throw new Error(`iCloud antwortet mit Status ${r.status}`);
    return { url: target, xml: r.body };
  }
  throw new Error('iCloud leitet zu oft weiter');
}

const tag = (name) => new RegExp(`<(?:[\\w-]+:)?${name}(?=[\\s/>])[^>]*?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}\\s*>)`, 'gi');
const all = (xml, name) => [...xml.matchAll(tag(name))].map((m) => m[1] ?? '');
const first = (xml, name) => all(xml, name)[0];
const has = (xml, name) => tag(name).test(xml);

function text(value = '') {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);
  if (cdata) return cdata[1];
  return value.replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const escapeXml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A multistatus response per resource, keeping only properties the server really returned (status 200).
function responses(xml) {
  return all(xml, 'response').map((r) => ({
    href: text(first(r, 'href')).trim(),
    props: all(r, 'propstat').filter((p) => /\s200\b/.test(first(p, 'status') || '')).map((p) => first(p, 'prop') || '').join(''),
  }));
}

// Where an account's data lives does not change while this per-user process runs.
const homes = new Map();

async function homeSet(base, setName, namespace) {
  if (!homes.has(base)) homes.set(base, await findHome(base, setName, namespace));
  return homes.get(base);
}

async function findHome(base, setName, namespace) {
  const propfind = (body) => `<d:propfind xmlns:d="DAV:" xmlns:c="${namespace}"><d:prop>${body}</d:prop></d:propfind>`;
  const root = await dav('PROPFIND', base, propfind('<d:current-user-principal/>'), '0');
  const principal = first(responses(root.xml)[0]?.props || '', 'current-user-principal');
  if (!principal) throw new Error('iCloud liefert kein Benutzerkonto');
  const found = await dav('PROPFIND', safeUrl(text(first(principal, 'href')).trim(), root.url), propfind(`<c:${setName}/>`), '0');
  const home = first(responses(found.xml)[0]?.props || '', setName);
  if (!home) throw new Error('iCloud liefert keinen Datenbereich fuer dieses Konto');
  return safeUrl(text(first(home, 'href')).trim(), found.url);
}

module.exports = { dav, homeSet, responses, all, first, has, text, escapeXml, safeUrl, setTransport };
