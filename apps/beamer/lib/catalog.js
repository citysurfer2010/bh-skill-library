'use strict';
/** Was die App anbietet. Der Browser schickt nur Kennungen; Adressen und Videos stehen ausschließlich hier. */
const MOODS = [
  { id: 'kamin', label: 'Kaminfeuer', video: '6VB4bgiB0yA' },
  { id: 'lagerfeuer', label: 'Lagerfeuer', video: 'zdkOAN6nI4s' },
  { id: 'regen', label: 'Regen am Fenster', video: 'cjrZwn7JQvc' },
  { id: 'strand', label: 'Strand bei Sonnenuntergang', video: 'dh4KtUdVuYc' },
  { id: 'schnee', label: 'Schneefall im Wald', video: 'VYUAqNCt0Lo' },
  { id: 'aquarium', label: 'Aquarium', video: 'H_swbFgSROs' },
];

const rndfnk = (p) => `https://dispatcher.rndfnk.com/${p}/live/mp3/mid`;
const STATIONS = [
  { id: 'radioeins', label: 'radioeins', url: rndfnk('rbb/radioeins') },
  { id: 'fritz', label: 'Fritz', url: rndfnk('rbb/fritz') },
  { id: 'rbb888', label: 'rbb 88.8', url: rndfnk('rbb/rbb888') },
  { id: 'dlf', label: 'Deutschlandfunk', url: 'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3' },
  { id: 'dlfkultur', label: 'Deutschlandfunk Kultur', url: 'https://st02.sslstream.dlf.de/dlf/02/128/mp3/stream.mp3' },
  { id: 'ndr2', label: 'NDR 2', url: 'https://icecast.ndr.de/ndr/ndr2/hamburg/mp3/128/stream.mp3' },
  { id: '1live', label: '1LIVE', url: 'https://wdr-1live-live.icecastssl.wdr.de/wdr/1live/live/mp3/128/stream.mp3' },
  { id: 'bayern3', label: 'Bayern 3', url: rndfnk('br/br3') },
  { id: 'swr3', label: 'SWR3', url: 'https://liveradio.swr.de/sw282p3/swr3/play.mp3' },
  { id: 'klassik', label: 'Klassik Radio', url: 'https://stream.klassikradio.de/live/mp3-192/stream.klassikradio.de/' },
  { id: 'brklassik', label: 'BR-Klassik', url: rndfnk('br/brklassik') },
  { id: 'bob', label: 'Radio Bob', url: 'https://streams.radiobob.de/bob-live/mp3-192/mediaplayer' },
];

const APPS = ['YouTube', 'Prime Video', 'Netflix', 'Disney+', 'Apple TV', 'Spotify', 'WOW', 'Internet'];
// Bewusst ohne KEY_POWER: Ein/Aus läuft über /api/power, das den Zustand prüft.
const KEYS = ['KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER', 'KEY_RETURN', 'KEY_HOME', 'KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE', 'KEY_PLAY', 'KEY_PAUSE'];

const publicCatalog = () => ({
  moods: MOODS.map(({ id, label, video }) => ({ id, label, thumb: `https://i.ytimg.com/vi/${video}/mqdefault.jpg` })),
  stations: STATIONS.map(({ id, label }) => ({ id, label })),
  apps: APPS,
});

module.exports = { MOODS, STATIONS, APPS, KEYS, publicCatalog };
