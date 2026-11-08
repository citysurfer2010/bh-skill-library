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
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACTIVE = ['PLAYING', 'TRANSITIONING', 'PAUSED_PLAYBACK'];

// Mit installierter App BH Screen zeigt der Beamer den Text selbst; sonst als Bild per Stream.
async function showText(title, text, { remote = require('./remote.js'), dlna = require('./dlna.js'), waitMs = 2500 } = {}) {
  await setContent({ mode: 'text', title, text });
  if (await remote.isInstalled('BH Screen')) { await remote.openApp('BH Screen'); return 'app'; }
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
    await remote.openApp('BH Screen', { restart: true });
    return 'app';
  }
  await remote.launchBrowser(href);
  return 'browser';
}

module.exports = { httpsUrl, setContent, showText, showUrl };
