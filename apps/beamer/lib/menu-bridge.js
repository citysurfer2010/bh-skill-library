'use strict';
/** Verbindet das Menü auf dem Beamer mit der App: Menü hinschieben, Auswahl der Fernbedienung abholen und ausführen. */
const gateway = require('./gateway');
const { beamerMenu } = require('./catalog');

// Eine einzige wartende Anfrage statt Dauerabfragen: Das Gateway antwortet, sobald jemand etwas wählt.
const WAIT_S = 20; const IDLE_MS = 5000;

let schedule = null;
let alerts = [];
let board = null;
let birthdays = [];
let onThisDay = null;
const pushMenu = () => gateway.call('beamer_menu_set', { menu: { ...beamerMenu(), schedule, alerts, board, birthdays, onThisDay } });

// Bis 7 Uhr ist der Vertretungsplan eingestellt; um 16:05 springt die Anzeige auf den nächsten Schultag.
const SCHEDULE_AT = ['06:30', '06:45', '07:00', '10:00', '13:00', '16:05'];
const MIN_GAP_MS = 120_000;
async function refreshSchedule() {
  schedule = JSON.parse(await gateway.call('webuntis_days', { count: 5 }));
  await pushMenu();
}
// Beim Öffnen der Seite frisch holen, aber nie öfter als alle 2 Minuten anmelden.
let lastFetch = 0; let running = null;
function refreshIfStale(force = false) {
  if (running) return running;
  if (!force && Date.now() - lastFetch < MIN_GAP_MS) return Promise.resolve(schedule);
  lastFetch = Date.now();
  running = refreshSchedule().then(() => schedule).finally(() => { running = null; });
  return running;
}
// Störungen alle 5 Minuten; gesendet wird nur, wenn sich etwas ändert.
async function refreshAlerts() {
  const next = JSON.parse(await gateway.call('bvg_alerts'));
  if (JSON.stringify(next) === JSON.stringify(alerts)) return;
  alerts = next;
  await pushMenu();
}
// Abfahrten über den Skill bvg, gesendet nur bei Änderung. Die Minuten rechnet der Beamer selbst.
async function refreshBoard() {
  const next = JSON.parse(await gateway.call('bvg_board'));
  if (JSON.stringify(next) === JSON.stringify(board)) return;
  board = next;
  await pushMenu();
}
// Geburtstage über den Skill birthdays, einmal pro Stunde; die Tagesfakten holt der Skill höchstens einmal am Tag.
async function refreshBirthdays() {
  const next = JSON.parse(await gateway.call('birthdays_upcoming'));
  let facts = null;
  if (next.some((b) => b.inDays === 0)) {
    try { facts = JSON.parse(await gateway.call('birthdays_on_this_day')); } catch (e) { console.error(`[geburtstag] ${e.message}`); }
  }
  if (JSON.stringify([next, facts]) === JSON.stringify([birthdays, onThisDay])) return;
  birthdays = next; onThisDay = facts;
  await pushMenu();
}
const berlinTime = (d = new Date()) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

async function tick(commands) {
  const list = JSON.parse(await gateway.call('beamer_menu_requests', { wait: WAIT_S }) || '[]');
  for (const { kind, id } of list) {
    if (commands[kind]) await commands[kind](id);
  }
}

function start(commands) {
  const loop = async () => {
    let wait = 50;
    try { await tick(commands); } catch (e) { wait = IDLE_MS; console.error(`[menu] ${e.message}`); }
    setTimeout(loop, wait);
  };
  const menu = () => pushMenu().catch((e) => console.error(`[menu] ${e.message}`));
  menu();
  const fetchBirthdays = () => refreshBirthdays().catch((e) => console.error(`[geburtstag] ${e.message}`));
  fetchBirthdays();
  const fetchPlan = () => refreshIfStale(true).catch((e) => console.error(`[stundenplan] ${e.message}`));
  fetchPlan();
  const fetchBoard = () => refreshBoard().catch((e) => console.error(`[bvg] ${e.message}`));
  fetchBoard(); setInterval(fetchBoard, 60_000);
  const fetchAlerts = () => refreshAlerts().catch((e) => console.error(`[bvg] ${e.message}`));
  fetchAlerts(); setInterval(fetchAlerts, 300_000);
  let last = '';
  setInterval(() => { const t = berlinTime(); if (t !== last && SCHEDULE_AT.includes(t)) fetchPlan(); if (t !== last && t.endsWith(':01')) fetchBirthdays(); last = t; }, 20_000);
  loop();
}

module.exports = { start, tick, pushMenu, refreshSchedule, refreshIfStale, refreshAlerts, refreshBoard, refreshBirthdays, SCHEDULE_AT };
