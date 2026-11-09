'use strict';
/** What the app offers. The browser only sends IDs; addresses and videos live exclusively here. */
const MOODS = [
  { id: 'kamin', label: 'Kaminfeuer', video: '6VB4bgiB0yA' },
  { id: 'strand', label: 'Strand am Abend', video: 'dh4KtUdVuYc' },
  { id: 'schnee', label: 'Schneefall', video: 'VYUAqNCt0Lo' },
  { id: 'lagerfeuer', label: 'Lagerfeuer am Abend', video: 'eoYHOtzuq6s', winterVideo: 'PNfjp3e_2oM' },
  { id: 'aquarium', label: 'Aquarium', video: 'H_swbFgSROs', frame: 2 },
  { id: 'regen', label: 'Regen am Fenster', video: 'cjrZwn7JQvc' },
];

// The snow video only fits in winter (November to February).
const isWinter = (now = new Date()) => [10, 11, 0, 1].includes(now.getMonth());
const videoOf = (mood, now = new Date()) => (mood.winterVideo && isWinter(now) ? mood.winterVideo : mood.video);

const rndfnk = (p) => `https://dispatcher.rndfnk.com/${p}/live/mp3/mid`;
const STATIONS = [
  { id: 'radioeins', sub: 'rbb', label: 'radioeins', url: rndfnk('rbb/radioeins') },
  { id: 'fritz', sub: 'rbb', label: 'Fritz', url: rndfnk('rbb/fritz') },
  { id: 'rbb888', sub: 'Berlin', label: 'rbb 88.8', url: rndfnk('rbb/rbb888') },
  { id: 'jump', sub: 'MDR', label: 'MDR JUMP', url: 'https://mdr-284320-0.sslcast.mdr.de/mdr/284320/0/mp3/high/stream.mp3' },
  { id: 'dlf', sub: 'Information', label: 'Deutschlandfunk', url: 'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3' },
  { id: 'dlfkultur', sub: 'Kultur', label: 'Deutschlandfunk Kultur', url: 'https://st02.sslstream.dlf.de/dlf/02/128/mp3/stream.mp3' },
  { id: 'ndr2', sub: 'Hamburg', label: 'NDR 2', url: 'https://icecast.ndr.de/ndr/ndr2/hamburg/mp3/128/stream.mp3' },
  { id: '1live', sub: 'WDR', label: '1LIVE', url: 'https://wdr-1live-live.icecastssl.wdr.de/wdr/1live/live/mp3/128/stream.mp3' },
  { id: 'bayern3', sub: 'BR', label: 'Bayern 3', url: rndfnk('br/br3') },
  { id: 'swr3', sub: 'SWR', label: 'SWR3', url: 'https://liveradio.swr.de/sw282p3/swr3/play.mp3' },
  { id: 'klassik', sub: 'Klassik', label: 'Klassik Radio', url: 'https://stream.klassikradio.de/live/mp3-192/stream.klassikradio.de/' },
  { id: 'brklassik', sub: 'BR', label: 'BR-Klassik', url: rndfnk('br/brklassik') },
  { id: 'bob', sub: 'Rock', label: 'Radio Bob', url: 'https://streams.radiobob.de/bob-live/mp3-192/mediaplayer' },
];

const APPS = ['YouTube', 'Prime Video', 'Netflix', 'Disney+', 'Apple TV', 'Spotify', 'WOW', 'Internet'];
// Deliberately without KEY_POWER: on/off goes through /api/power, which checks the state.
const KEYS = ['KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER', 'KEY_RETURN', 'KEY_HOME', 'KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE', 'KEY_PLAY', 'KEY_PAUSE'];

const publicCatalog = () => ({
  moods: MOODS.map((m) => { const video = videoOf(m); const f = m.frame || 1; return { id: m.id, label: m.label, thumb: `https://i.ytimg.com/vi/${video}/hq${f}.jpg`, hero: `https://i.ytimg.com/vi/${video}/maxres${f}.jpg` }; }),
  stations: STATIONS.map(({ id, label, sub }) => ({ id, name: label.replace(/ Kultur$/, ''), sub })),
  apps: APPS,
});

// Menu for the app on the Beamer: it plays stations itself and therefore needs the addresses.
const byIdVideo = (id) => videoOf(MOODS.find((m) => m.id === id));
const beamerMenu = () => ({
  radio: STATIONS.map(({ id, label, sub, url }) => ({ id, name: label.replace(/ Kultur$/, ''), sub, url })),
  mood: publicCatalog().moods.map((m) => ({ id: m.id, label: m.label, thumb: m.thumb, video: byIdVideo(m.id) })),
});

module.exports = { beamerMenu, videoOf, MOODS, STATIONS, APPS, KEYS, publicCatalog };
