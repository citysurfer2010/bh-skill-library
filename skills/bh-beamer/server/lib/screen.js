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

async function showText(title, text) {
  await setContent(title, text);
  await launchBrowser(process.env.BH_SCREEN_URL);
}

module.exports = { httpsUrl, setContent, showText };
