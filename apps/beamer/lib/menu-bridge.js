'use strict';
/** Verbindet das Menü auf dem Beamer mit der App: Menü hinschieben, Auswahl der Fernbedienung abholen und ausführen. */
const gateway = require('./gateway');
const { beamerMenu } = require('./catalog');

const POLL_MS = 800; const IDLE_MS = 5000; const MENU_MS = 300_000;

let schedule = null;
const pushMenu = () => gateway.call('beamer_menu_set', { menu: { ...beamerMenu(), schedule } });

// Bis 7 Uhr ist der Vertretungsplan eingestellt; um 16:05 springt die Anzeige auf den nächsten Schultag.
const SCHEDULE_AT = ['06:30', '06:45', '07:00', '10:00', '13:00', '16:05'];
const MIN_GAP_MS = 120_000;
async function refreshSchedule() {
  schedule = JSON.parse(await gateway.call('webuntis_day'));
  await pushMenu();
}
// Beim Öffnen der Seite frisch holen, aber nie öfter als alle 2 Minuten anmelden.
let lastFetch = 0; let running = null;
function refreshIfStale(force = false) {
  if (running) return running;
  if (!force && schedule && Date.now() - lastFetch < MIN_GAP_MS) return Promise.resolve(schedule);
  lastFetch = Date.now();
  running = refreshSchedule().then(() => schedule).finally(() => { running = null; });
  return running;
}
const berlinTime = (d = new Date()) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

async function tick(commands) {
  const list = JSON.parse(await gateway.call('beamer_menu_requests') || '[]');
  for (const { kind, id } of list) {
    if (commands[kind]) await commands[kind](id);
  }
}

function start(commands) {
  const loop = async () => {
    let wait = POLL_MS;
    try { await tick(commands); } catch (e) { wait = IDLE_MS; console.error(`[menu] ${e.message}`); }
    setTimeout(loop, wait);
  };
  const menu = () => pushMenu().catch((e) => console.error(`[menu] ${e.message}`));
  menu(); setInterval(menu, MENU_MS);
  const fetchPlan = () => refreshIfStale(true).catch((e) => console.error(`[stundenplan] ${e.message}`));
  fetchPlan();
  let last = '';
  setInterval(() => { const t = berlinTime(); if (t !== last && SCHEDULE_AT.includes(t)) fetchPlan(); last = t; }, 20_000);
  loop();
}

module.exports = { start, tick, pushMenu, refreshSchedule, refreshIfStale, SCHEDULE_AT };
