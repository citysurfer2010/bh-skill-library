'use strict';
/** "Today" page: reads the same state as the Beamer, without its own queries to the services. */
const express = require('express');
const bridge = require('../lib/menu-bridge');

function buildRouter() {
  const r = express.Router();
  r.get('/today', (req, res) => {
    // Fetch fresh only when the page is opened; the bridge re-registers at most every 2 minutes.
    if (req.query.fresh === '1') bridge.refreshIfStale().catch(() => {});
    res.set('Cache-Control', 'no-store').json({ ...bridge.snapshot(), workEvents: bridge.workFor(req.user.email) });
  });
  return r;
}
module.exports = { buildRouter };
