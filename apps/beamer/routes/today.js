'use strict';
/** Seite „Heute“: liest denselben Stand wie der Beamer, ohne eigene Abfragen an die Dienste. */
const express = require('express');
const gateway = require('../lib/gateway');
const bridge = require('../lib/menu-bridge');

function buildRouter() {
  const r = express.Router();
  r.get('/today', (req, res) => {
    // Nur beim Öffnen der Seite frisch holen; die Brücke meldet sich höchstens alle 2 Minuten neu an.
    if (req.query.fresh === '1') bridge.refreshIfStale().catch(() => {});
    res.set('Cache-Control', 'no-store').json(bridge.snapshot());
  });
  r.post('/heating', async (req, res) => {
    const { room, temp, backToPlan } = req.body || {};
    if (!/^\d{1,20}$/.test(String(room))) return res.status(400).json({ error: 'Raum fehlt' });
    if (!backToPlan && (typeof temp !== 'number' || temp < 7 || temp > 30 || (temp * 2) % 1 !== 0)) return res.status(400).json({ error: 'Solltemperatur von 7 bis 30 Grad in halben Schritten' });
    try {
      await gateway.call('netatmo_set_room', backToPlan ? { room, backToPlan: true } : { room, temp });
    } catch (e) { return res.status(502).json({ error: 'Netatmo hat nicht geantwortet' }); }
    await bridge.refreshRooms().catch(() => {});
    setTimeout(() => bridge.refreshRooms().catch(() => {}), 10_000).unref();
    return res.json({ ok: true, ...bridge.snapshot() });
  });
  return r;
}
module.exports = { buildRouter };
