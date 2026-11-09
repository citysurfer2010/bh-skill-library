'use strict';
/** Seite „Heute“: liest denselben Stand wie der Beamer, ohne eigene Abfragen an die Dienste. */
const express = require('express');
const bridge = require('../lib/menu-bridge');

function buildRouter() {
  const r = express.Router();
  r.get('/today', (req, res) => {
    // Nur beim Öffnen der Seite frisch holen; die Brücke meldet sich höchstens alle 2 Minuten neu an.
    if (req.query.fresh === '1') bridge.refreshIfStale().catch(() => {});
    res.set('Cache-Control', 'no-store').json(bridge.snapshot());
  });
  return r;
}
module.exports = { buildRouter };
