/** Sets what the display page shows and opens addresses in the Beamer's browser. */
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

// After a web page the app has left its own page and polls no more: only a restart brings it back.
const afterPrevious = (c) => (c.previous === 'url' ? { restart: true } : undefined);

// Do not wait: the app shows the new content at once; if it is already running, the Beamer answers the start only after the time limit.
function bringToFront(remote, current) { Promise.resolve(remote.openApp('BH Home', afterPrevious(current))).catch(() => {}); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACTIVE = ['PLAYING', 'TRANSITIONING', 'PAUSED_PLAYBACK'];

// With the BH Home app installed the Beamer shows the text itself; otherwise as an image via stream.
async function showText(title, text, { remote = require('./remote.js'), dlna = require('./dlna.js'), waitMs = 2500 } = {}) {
  const current = await setContent({ mode: 'text', title, text });
  if (await remote.isInstalled('BH Home')) { bringToFront(remote, current); return 'app'; }
  const image = `${process.env.BH_SCREEN_URL}/image.jpg?v=${Date.now()}`;
  for (const url of [image, image.replace(/^https:/, 'http:')]) {
    await dlna.play(url, title, 'image');
    await sleep(waitMs);
    if (ACTIVE.includes(await dlna.state())) return 'stream';
  }
  throw new Error('Der Beamer hat das Bild nicht angenommen');
}

// The BH Home app opens web pages full screen; without it only the Samsung browser remains, without passing the address.
async function showUrl(url, { remote = require('./remote.js') } = {}) {
  const href = httpsUrl(url);
  if (await remote.isInstalled('BH Home')) {
    await setContent({ mode: 'url', url: href });
    remote.openApp('BH Home', { restart: true }).catch(() => {});
    return 'app';
  }
  await remote.launchBrowser(href);
  return 'browser';
}

async function showHome({ remote = require('./remote.js') } = {}) {
  bringToFront(remote, await setContent({ mode: 'text', title: '', text: '' }));
}

// Ambience in BH Home, optionally with radio: this way the app keeps the remote control.
async function playAmbient({ video, title, radioUrl, station }, { remote = require('./remote.js') } = {}) {
  if (radioUrl) httpsUrl(radioUrl);
  bringToFront(remote, await setContent({ mode: 'video', video, title, ...(radioUrl ? { url: radioUrl, station } : {}) }));
}

const authed = () => ({ authorization: `Bearer ${process.env.BH_SCREEN_WRITE}` });
async function setMenu(menu, http = fetch) {
  const r = await http(`${process.env.BH_AUTH_INTERNAL}/screen-menu`, { method: 'POST', headers: { ...authed(), 'content-type': 'application/json' }, body: JSON.stringify(menu) });
  if (!r.ok) throw new Error(`Menue nicht gesetzt (${r.status})`);
}
async function menuRequests(wait = 0, http = fetch) {
  const r = await http(`${process.env.BH_AUTH_INTERNAL}/screen-requests?wait=${Number(wait) || 0}`, { headers: authed() });
  if (!r.ok) throw new Error(`Auswahl nicht lesbar (${r.status})`);
  return (await r.json()).requests;
}

async function playRadio(url, title, { remote = require('./remote.js') } = {}) {
  const href = httpsUrl(url);
  if (!(await remote.isInstalled('BH Home'))) throw new Error('Radio braucht die App BH Home');
  bringToFront(remote, await setContent({ mode: 'audio', url: href, title }));
}

const stopRadio = () => setContent({ mode: 'text', title: '', text: '' });

// Screen sharing: the server only relays offer and answer, the picture runs directly in the home network.
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
