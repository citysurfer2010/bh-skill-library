'use strict';
/** Connects the Beamer menu to the app: pushes the menu, picks up the remote control selection and executes it. */
const gateway = require('./gateway');
const { beamerMenu } = require('./catalog');

// A single waiting request instead of constant polling: the gateway answers as soon as someone picks something.
const WAIT_S = 20; const IDLE_MS = 5000;

let schedule = null;
let alerts = [];
let board = null;
let birthdays = [];
let onThisDay = null;
let rooms = [];
let heating = null;
let events = [];
let eventsLoaded = false;
let work = null;
let photoAlbums = [];
const pushMenu = () => gateway.call('beamer_menu_set', { menu: { ...beamerMenu(), schedule, alerts, board, birthdays, onThisDay, rooms, heating, events, photoAlbums } });

// Until 7:00 the substitution plan is set; at 16:05 the display jumps to the next school day.
const SCHEDULE_AT = ['06:30', '06:45', '07:00', '10:00', '13:00', '16:05'];
const MIN_GAP_MS = 120_000;
async function refreshSchedule() {
  schedule = JSON.parse(await gateway.call('webuntis_days', { count: 5 }));
  await pushMenu();
}
// Fetch fresh when the page is opened, but never register more often than every 2 minutes.
let lastFetch = 0; let running = null;
function refreshIfStale(force = false) {
  if (running) return running;
  if (!force && Date.now() - lastFetch < MIN_GAP_MS) return Promise.resolve(schedule);
  lastFetch = Date.now();
  running = refreshSchedule().then(() => schedule).finally(() => { running = null; });
  return running;
}
// Disruptions every 5 minutes; sent only when something changes.
async function refreshAlerts() {
  const next = JSON.parse(await gateway.call('bvg_alerts'));
  if (JSON.stringify(next) === JSON.stringify(alerts)) return;
  alerts = next;
  await pushMenu();
}
// Departures via the bvg skill, sent only on change. The Beamer calculates the minutes itself.
async function refreshBoard() {
  const next = JSON.parse(await gateway.call('bvg_board'));
  if (JSON.stringify(next) === JSON.stringify(board)) return;
  board = next;
  await pushMenu();
}
// Birthdays via the birthdays skill, once per hour; the skill fetches the daily facts at most once a day.
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
// Room values via the netatmo skill, every 10 minutes; sent only on change. On errors the last values remain.
async function refreshRooms() {
  const status = JSON.parse(await gateway.call('netatmo_status'));
  const nextHeating = { plan: status.plan, mode: status.mode };
  if (JSON.stringify([status.rooms, nextHeating]) === JSON.stringify([rooms, heating])) return;
  rooms = status.rooms; heating = nextHeating;
  await pushMenu();
}
// One-off events via the familycal skill, every 30 minutes; sent only on change.
async function refreshEvents() {
  const next = JSON.parse(await gateway.call('familycal_upcoming'));
  eventsLoaded = true;
  if (JSON.stringify(next) === JSON.stringify(events)) return;
  events = next; eventsLoaded = true;
  await pushMenu();
}
// Albums for the slideshow, every 6 hours; sent only on change.
async function refreshAlbums() {
  const next = JSON.parse(await gateway.call('photos_albums'));
  if (JSON.stringify(next) === JSON.stringify(photoAlbums)) return;
  photoAlbums = next;
  await pushMenu();
}
// Work appointments stay out of the beamer menu; only the owner's page reads them.
async function refreshWork() { work = JSON.parse(await gateway.call('workcal_upcoming')); }
const workFor = (email) => (work && work.owner === String(email).toLowerCase() ? work.events : []);
const isWorkOwner = (email) => !!work?.owner && work.owner === String(email || '').toLowerCase();
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
  const fetchRooms = () => refreshRooms().catch((e) => console.error(`[netatmo] ${e.message}`));
  fetchRooms(); setInterval(fetchRooms, 600_000);
  const fetchEvents = () => refreshEvents().catch((e) => console.error(`[kalender] ${e.message}`));
  fetchEvents(); setInterval(fetchEvents, 1_800_000);
  const fetchAlbums = () => refreshAlbums().catch((e) => console.error(`[fotos] ${e.message}`));
  fetchAlbums(); setInterval(fetchAlbums, 21_600_000);
  const fetchWork = () => refreshWork().catch((e) => console.error(`[workcal] ${e.message}`));
  fetchWork(); setInterval(fetchWork, 1_800_000);
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

const snapshot = () => ({ schedule, alerts, board, birthdays, onThisDay, rooms, heating, events, eventsLoaded });

module.exports = { snapshot, refreshWork, workFor, isWorkOwner, start, tick, pushMenu, refreshSchedule, refreshIfStale, refreshAlerts, refreshBoard, refreshBirthdays, refreshRooms, refreshEvents, refreshAlbums, SCHEDULE_AT };
