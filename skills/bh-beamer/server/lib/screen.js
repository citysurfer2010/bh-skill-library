/** Legt fest, was die Anzeigeseite zeigt, und oeffnet Adressen im Browser des Beamers. */
'use strict';

const { launchBrowser } = require('./remote.js');

function httpsUrl(u) {
  let p; try { p = new URL(u); } catch { throw new Error('Ungueltige Adresse'); }
  if (p.protocol !== 'https:') throw new Error('Nur https-Adressen');
  return p.href;
}

async function setContent(payload, http = fetch) {
  const r = await http(`${process.env.BH_AUTH_INTERNAL}/screen-update`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.BH_SCREEN_WRITE}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Anzeige konnte nicht gesetzt werden (${r.status})`);
  return r.json ? r.json().catch(() => ({})) : {};
}

// Nach einer Webseite hat die App ihre eigene Seite verlassen und fragt nichts mehr ab: nur ein Neustart holt sie zurueck.
const afterPrevious = (c) => (c.previous === 'url' ? { restart: true } : undefined);

// Nicht warten: Die App zeigt den neuen Inhalt sofort; laeuft sie schon, antwortet der Beamer auf den Start erst nach dem Zeitlimit.
function bringToFront(remote, current) { Promise.resolve(remote.openApp('BH Screen', afterPrevious(current))).catch(() => {}); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACTIVE = ['PLAYING', 'TRANSITIONING', 'PAUSED_PLAYBACK'];

// Mit installierter App BH Screen zeigt der Beamer den Text selbst; sonst als Bild per Stream.
async function showText(title, text, { remote = require('./remote.js'), dlna = require('./dlna.js'), waitMs = 2500 } = {}) {
  const current = await setContent({ mode: 'text', title, text });
  if (await remote.isInstalled('BH Screen')) { bringToFront(remote, current); return 'app'; }
  const image = `${process.env.BH_SCREEN_URL}/image.jpg?v=${Date.now()}`;
  for (const url of [image, image.replace(/^https:/, 'http:')]) {
    await dlna.play(url, title, 'image');
    await sleep(waitMs);
    if (ACTIVE.includes(await dlna.state())) return 'stream';
  }
  throw new Error('Der Beamer hat das Bild nicht angenommen');
}

// Webseiten oeffnet die App BH Screen im Vollbild; ohne App bleibt nur der Samsung-Browser ohne Adressuebergabe.
async function showUrl(url, { remote = require('./remote.js') } = {}) {
  const href = httpsUrl(url);
  if (await remote.isInstalled('BH Screen')) {
    await setContent({ mode: 'url', url: href });
    remote.openApp('BH Screen', { restart: true }).catch(() => {});
    return 'app';
  }
  await remote.launchBrowser(href);
  return 'browser';
}

async function showHome({ remote = require('./remote.js') } = {}) {
  bringToFront(remote, await setContent({ mode: 'text', title: '', text: '' }));
}

// Stimmung in BH Screen, optional mit Radio dazu: Die App behaelt so die Fernbedienung.
async function playAmbient({ video, title, radioUrl, station }, { remote = require('./remote.js') } = {}) {
  if (radioUrl) httpsUrl(radioUrl);
  bringToFront(remote, await setContent({ mode: 'video', video, title, ...(radioUrl ? { url: radioUrl, station } : {}) }));
}

const authed = () => ({ authorization: `Bearer ${process.env.BH_SCREEN_WRITE}` });
async function setMenu(menu, http = fetch) {
  const r = await http(`${process.env.BH_AUTH_INTERNAL}/screen-menu`, { method: 'POST', headers: { ...authed(), 'content-type': 'application/json' }, body: JSON.stringify(menu) });
  if (!r.ok) throw new Error(`Menue nicht gesetzt (${r.status})`);
}
async function menuRequests(http = fetch) {
  const r = await http(`${process.env.BH_AUTH_INTERNAL}/screen-requests`, { headers: authed() });
  if (!r.ok) throw new Error(`Auswahl nicht lesbar (${r.status})`);
  return (await r.json()).requests;
}

async function playRadio(url, title, { remote = require('./remote.js') } = {}) {
  const href = httpsUrl(url);
  if (!(await remote.isInstalled('BH Screen'))) throw new Error('Radio braucht die App BH Screen');
  bringToFront(remote, await setContent({ mode: 'audio', url: href, title }));
}

const stopRadio = () => setContent({ mode: 'text', title: '', text: '' });

// Bildschirmfreigabe: Der Server vermittelt nur Angebot und Antwort, das Bild laeuft direkt im Heimnetz.
async function shareStart(offer, { remote = require('./remote.js') } = {}) {
  const current = await setContent({ mode: 'share', offer });
  bringToFront(remote, current);
  return current.session;
}

async function shareAnswer(session, http = fetch) {
  const r = await http(`${process.env.BH_AUTH_INTERNAL}/screen-answer?session=${encodeURIComponent(session)}`, { headers: { authorization: `Bearer ${process.env.BH_SCREEN_WRITE}` } });
  if (!r.ok) throw new Error(`Antwort des Beamers nicht lesbar (${r.status})`);
  return (await r.json()).answer || '';
}

module.exports = { httpsUrl, setContent, showText, showUrl, playRadio, stopRadio, shareStart, shareAnswer, showHome, setMenu, menuRequests, playAmbient };
