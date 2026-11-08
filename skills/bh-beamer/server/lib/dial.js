/** Startet YouTube-Videos ueber das DIAL-Protokoll der YouTube-App (Port 8080, nur durch den WireGuard-Tunnel). */
'use strict';

let http = (...a) => fetch(...a);
const setFetch = (f) => { http = f; };
const base = () => `http://${process.env.BH_BEAMER_IP}:8080/ws/apps/YouTube`;
const ID = /^[A-Za-z0-9_-]{11}$/;

/** Nimmt eine Video-Kennung oder eine YouTube-Adresse (watch, youtu.be, shorts, embed, live) und liefert die Kennung. */
function videoId(input) {
  const s = String(input || '').trim();
  if (ID.test(s)) return s;
  let u; try { u = new URL(s); } catch { throw new Error('Keine YouTube-Adresse oder Video-Kennung'); }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') || /^\/(?:shorts|embed|live|v)\/([^/?]+)/.exec(u.pathname)?.[1];
  if (!id || !ID.test(id)) throw new Error('Keine YouTube-Adresse oder Video-Kennung');
  return id;
}

// Ohne `Origin: https://www.youtube.com` antwortet der Beamer mit 403; Port 8001 lehnt DIAL-Starts mit 401 ab.
async function playYoutube(input) {
  const id = videoId(input);
  let r;
  try {
    r = await http(base(), { method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8', origin: 'https://www.youtube.com' }, body: `v=${id}`, signal: AbortSignal.timeout(8000) });
  } catch { throw new Error('Beamer ist aus oder nicht erreichbar'); }
  if (r.status !== 201 && r.status !== 200) throw new Error(`YouTube liess sich nicht starten (Fehler ${r.status})`);
  return id;
}

async function youtubeState() {
  let r; try { r = await http(base(), { signal: AbortSignal.timeout(6000) }); } catch { throw new Error('Beamer ist aus oder nicht erreichbar'); }
  return /<state>([^<]+)/.exec(await r.text())?.[1] || 'unbekannt';
}

module.exports = { videoId, playYoutube, youtubeState, setFetch };
