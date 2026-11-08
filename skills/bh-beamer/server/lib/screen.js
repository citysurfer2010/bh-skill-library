/** Legt fest, was die Anzeigeseite zeigt, und oeffnet Adressen im Browser des Beamers. */
'use strict';

const { launchBrowser } = require('./remote.js');

function httpsUrl(u) {
  let p; try { p = new URL(u); } catch { throw new Error('Ungueltige Adresse'); }
  if (p.protocol !== 'https:') throw new Error('Nur https-Adressen');
  return p.href;
}

async function setContent(title, text, http = fetch) {
  const r = await http(`${process.env.BH_AUTH_INTERNAL}/screen-update`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.BH_SCREEN_WRITE}`, 'content-type': 'application/json' }, body: JSON.stringify({ title, text }),
  });
  if (!r.ok) throw new Error(`Anzeige konnte nicht gesetzt werden (${r.status})`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACTIVE = ['PLAYING', 'TRANSITIONING', 'PAUSED_PLAYBACK'];

// Viele Geraete koennen per Stream kein https: dann derselbe Abruf unverschluesselt.
async function showText(title, text, { dlna = require('./dlna.js'), waitMs = 2500 } = {}) {
  await setContent(title, text);
  const image = `${process.env.BH_SCREEN_URL}/image.jpg?v=${Date.now()}`;
  for (const url of [image, image.replace(/^https:/, 'http:')]) {
    await dlna.play(url, title, 'image');
    await sleep(waitMs);
    if (ACTIVE.includes(await dlna.state())) return;
  }
  throw new Error('Der Beamer hat das Bild nicht angenommen');
}

module.exports = { httpsUrl, setContent, showText };
