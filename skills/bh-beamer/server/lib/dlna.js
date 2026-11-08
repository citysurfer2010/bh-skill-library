/** Spielt Medien per DLNA auf dem Beamer ab (Port 9197, nur durch den WireGuard-Tunnel erreichbar). */
'use strict';

const AVT = 'urn:schemas-upnp-org:service:AVTransport:1';
let http = (...a) => fetch(...a);
const setFetch = (f) => { http = f; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const base = () => `http://${process.env.BH_BEAMER_IP}:9197`;

async function controlUrl() {
  let r;
  try { r = await http(`${base()}/dmr`, { signal: AbortSignal.timeout(6000) }); } catch { throw new Error('Beamer ist aus oder nicht erreichbar'); }
  const xml = await r.text();
  const block = (xml.match(/<service>[\s\S]*?<\/service>/g) || []).find((s) => s.includes(AVT));
  const path = block && /<controlURL>([^<]+)<\/controlURL>/.exec(block);
  if (!path) throw new Error('Der Beamer bietet keine Medienwiedergabe an');
  return new URL(path[1], `${base()}/`).href;
}

async function soap(action, args = '') {
  const url = await controlUrl();
  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${AVT}"><InstanceID>0</InstanceID>${args}</u:${action}></s:Body></s:Envelope>`;
  const r = await http(url, { method: 'POST', headers: { 'content-type': 'text/xml; charset="utf-8"', soapaction: `"${AVT}#${action}"` }, body, signal: AbortSignal.timeout(10000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Der Beamer lehnt ${action} ab (Fehler ${/<errorCode>(\d+)/.exec(text)?.[1] || r.status})`);
  return text;
}

function mediaUrl(u) {
  let parsed; try { parsed = new URL(u); } catch { throw new Error('Ungueltige Adresse'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Nur http- oder https-Adressen');
  return parsed.href;
}

async function play(url, title = 'BH Platform', kind = 'video') {
  const href = mediaUrl(url);
  const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${esc(title)}</dc:title><upnp:class>${kind === 'image' ? 'object.item.imageItem.photo' : 'object.item.videoItem'}</upnp:class><res protocolInfo="http-get:*:${kind === 'image' ? 'image/jpeg' : '*'}:*">${esc(href)}</res></item></DIDL-Lite>`;
  await soap('SetAVTransportURI', `<CurrentURI>${esc(href)}</CurrentURI><CurrentURIMetaData>${esc(didl)}</CurrentURIMetaData>`);
  await soap('Play', '<Speed>1</Speed>');
}

const stop = () => soap('Stop');
async function state() { return /<CurrentTransportState>([^<]+)/.exec(await soap('GetTransportInfo'))?.[1] || 'unbekannt'; }

module.exports = { play, stop, state, setFetch, esc };
