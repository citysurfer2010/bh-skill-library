'use strict';
/** Bedienung des Beamers. Jeder Schreibweg verlangt JSON: ein fremdes Formular kann so nichts auslösen. */
const express = require('express');
const gateway = require('../lib/gateway');
const { MOODS, STATIONS, APPS, KEYS, publicCatalog } = require('../lib/catalog');

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const byId = (list, id) => list.find((x) => x.id === id);

function buildRouter() {
  const router = express.Router();
  let now = null;

  const requireJson = (req, res, next) => (req.is('application/json') ? next() : res.status(415).json({ error: 'Nur JSON' }));
  const action = (fn) => [requireJson, async (req, res) => {
    try {
      const result = await fn(req.body || {});
      if (result?.status) return res.status(result.status).json({ error: result.error });
      return res.json({ ok: true, now, ...result });
    } catch (e) { return res.status(502).json({ error: e.message }); }
  }];
  const bad = (error) => ({ status: 400, error });
  const stopRadioFirst = async () => { if (now?.kind === 'radio') await gateway.call('beamer_stop_radio').catch(() => {}); };

  router.get('/catalog', (_req, res) => res.json(publicCatalog()));

  router.get('/status', async (_req, res) => {
    let zustand = 'nicht erreichbar';
    try { zustand = JSON.parse(await gateway.call('beamer_status')).zustand || zustand; } catch { /* bleibt nicht erreichbar */ }
    res.json({ zustand, now });
  });

  router.post('/mood', action(async ({ id }) => {
    const mood = byId(MOODS, id);
    if (!mood) return bad('Unbekannte Stimmung');
    await stopRadioFirst();
    await gateway.call('beamer_play_youtube', { video: mood.video });
    now = { kind: 'mood', id: mood.id, label: mood.label };
  }));

  router.post('/radio', action(async ({ id }) => {
    const station = byId(STATIONS, id);
    if (!station) return bad('Unbekannter Sender');
    await gateway.call('beamer_play_radio', { url: station.url, title: station.label });
    now = { kind: 'radio', id: station.id, label: station.label };
  }));

  router.post('/radio/stop', action(async () => {
    await gateway.call('beamer_stop_radio');
    now = null;
  }));

  router.post('/youtube', action(async ({ video }) => {
    const v = clip(video, 300);
    if (!v) return bad('YouTube-Link fehlt');
    await stopRadioFirst();
    await gateway.call('beamer_play_youtube', { video: v });
    now = { kind: 'youtube', label: 'YouTube-Video' };
  }));

  router.post('/text', action(async ({ title, text }) => {
    const t = clip(title, 200);
    if (!t) return bad('Text fehlt');
    await gateway.call('beamer_show_text', { title: t, text: clip(text, 1000) });
    now = { kind: 'text', label: t };
  }));

  router.post('/url', action(async ({ url }) => {
    const u = clip(url, 2000);
    if (!/^https:\/\//i.test(u)) return bad('Nur https-Adressen');
    await gateway.call('beamer_show_url', { url: u });
    now = { kind: 'url', label: u.replace(/^https:\/\//i, '').slice(0, 60) };
  }));

  router.post('/app', action(async ({ app }) => {
    if (!APPS.includes(app)) return bad('Unbekannte App');
    await stopRadioFirst();
    await gateway.call('beamer_open_app', { app });
    now = { kind: 'app', id: app, label: app };
  }));

  router.post('/share/start', action(async ({ offer, kind }) => {
    if (typeof offer !== 'string' || !offer.startsWith('v=0') || offer.length > 24000) return bad('Angebot ungültig');
    const session = await gateway.call('beamer_share_start', { offer });
    now = { kind: 'share', label: kind === 'camera' ? 'Kamera' : 'Bildschirmfreigabe' };
    return { session };
  }));

  // Stoppen je nach Inhalt: Radio in BH Screen beenden, alles andere endet mit dem Sprung auf die Startseite.
  router.post('/stop', action(async () => {
    if (now?.kind === 'radio' || now?.kind === 'text' || now?.kind === 'share') await gateway.call('beamer_stop_radio');
    else await gateway.call('beamer_press', { key: 'KEY_HOME' });
    now = null;
  }));

  router.post('/share/answer', action(async ({ session }) => {
    if (typeof session !== 'string' || !/^[0-9a-f]{18}$/.test(session)) return bad('Sitzung ungültig');
    return { answer: await gateway.call('beamer_share_answer', { session }) };
  }));

  router.post('/share/stop', action(async () => {
    await gateway.call('beamer_stop_radio');
    now = null;
  }));

  router.post('/key', action(async ({ key }) => {
    if (!KEYS.includes(key)) return bad('Unbekannte Taste');
    await gateway.call('beamer_press', { key });
    if (key === 'KEY_HOME') now = null;
  }));

  router.post('/power', action(async ({ state }) => {
    if (state !== 'on' && state !== 'off') return bad('Ein oder Aus');
    await gateway.call('beamer_power', { state });
    if (state === 'off') now = null;
  }));

  return router;
}

module.exports = { buildRouter };
