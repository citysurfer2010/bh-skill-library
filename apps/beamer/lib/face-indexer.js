'use strict';
/** Drives the local face index during the night, one step at a time. Pauses while the slideshow is using the Synology. */
const gateway = require('./gateway');
const photoStream = require('./photo-stream');

const START_HOUR = 23; const END_HOUR = 7;
const STEP_GAP_MS = 5000; const IDLE_MS = 300_000; const ERROR_MS = 60_000; const FINISHED_MS = 6 * 3600_000; const SLIDESHOW_QUIET_MS = 120_000;

const berlinHour = (d = new Date()) => Number(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).find((p) => p.type === 'hour').value);
const inWindow = (hour) => hour >= START_HOUR || hour < END_HOUR;

/** One round; returns how long to wait before the next. */
async function round(now = new Date()) {
  if (!inWindow(berlinHour(now)) || Date.now() - photoStream.lastActive() < SLIDESHOW_QUIET_MS) return IDLE_MS;
  try {
    const result = JSON.parse(await gateway.call('faces_index_step'));
    if (result.paused) return IDLE_MS;
    return result.done ? FINISHED_MS : STEP_GAP_MS;
  } catch (e) { console.error(`[gesichter] ${e.message}`); return ERROR_MS; }
}

function start() {
  const loop = async () => { setTimeout(loop, await round()); };
  loop();
}

module.exports = { start, round, inWindow, berlinHour };
