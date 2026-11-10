'use strict';
/** Slideshow requests from the Beamer. Runs alongside the remote control loop, so a slow Synology never delays a key press. */
const gateway = require('./gateway');

const MIN_GAP_MS = 2000;
const ID = /^(all|next|a[0-9a-f]{12}|y\d{4})$/;
let busy = false; let last = 0;

function handle(id) {
  if (!ID.test(String(id))) return;
  if (id === 'next' && (busy || Date.now() - last < MIN_GAP_MS)) return;
  busy = true; last = Date.now();
  gateway.call('photos_push_next', { start: id }).catch((e) => console.error(`[fotos] ${e.message}`)).finally(() => { busy = false; });
}
const reset = () => { busy = false; last = 0; };
const lastActive = () => last;

module.exports = { handle, reset, lastActive };
