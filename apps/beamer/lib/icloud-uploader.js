'use strict';
/** Moves downloaded iCloud photos to the Synology, one at a time. Pauses while the slideshow is using it. */
const gateway = require('./gateway');
const photoStream = require('./photo-stream');

const STEP_GAP_MS = 2000; const IDLE_MS = 900_000; const ERROR_MS = 120_000; const QUIET_MS = 120_000; const PAUSED_MS = 60_000;

async function round() {
  if (Date.now() - photoStream.lastActive() < QUIET_MS) return PAUSED_MS;
  try {
    const r = JSON.parse(await gateway.call('icloudphotos_upload_step'));
    return r.done ? IDLE_MS : STEP_GAP_MS;
  } catch (e) { console.error(`[icloud] ${e.message}`); return ERROR_MS; }
}

function start() { const loop = async () => { setTimeout(loop, await round()); }; loop(); }

module.exports = { start, round };
