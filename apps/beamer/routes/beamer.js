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
  let replay = null; // womit sich der aktuelle Inhalt erneut starten laesst
  let resume = null; // was vor der Freigabe lief

  const requireJson = (req, res, next) => (req.is('application/json') ? next() : res.status(415).json({ error: 'Nur JSON' }));
  const action = (fn) => [requireJson, async (req, res) => {
    try {
      const result = await fn(req.body || {});
      if (result?.status) return res.status(result.status).json({ error: result.error });
      return res.json({ ok: true, now, ...result });
    } catch (e) { return res.status(502).json({ error: e.message }); }
  }];
  const bad = (error) => ({ status: 400, error });
  const play = async (tool, args, next) => { await gateway.call(tool, args); now = next; replay = { tool, args }; };
  const stopRadioFirst = async () => { if (now?.kind === 'radio') await gateway.call('beamer_stop_radio').catch(() => {}); };

  router.get('/catalog', (_req, res) => res.json(publicCatalog()));

  router.get('/status', async (_req, res) => {
    let zustand = 'nicht erreichbar';
    try { zustand = JSON.parse(await gateway.call('beamer_status')).zustand || zustand; } catch { /* bleibt nicht erreichbar */ }
    res.json({ zustand, now });
  });

  async function playMood(mood) {
    await stopRadioFirst();
    await play('beamer_play_youtube', { video: mood.video }, { kind: 'mood', id: mood.id, label: mood.label });
  }
  const playStation = (station) => play('beamer_play_radio', { url: station.url, title: station.label }, { kind: 'radio', id: station.id, label: station.label });

  router.post('/mood', action(async ({ id }) => {
    const mood = byId(MOODS, id);
    if (!mood) return bad('Unbekannte Stimmung');
    await playMood(mood);
  }));

  router.post('/radio', action(async ({ id }) => {
    const station = byId(STATIONS, id);
    if (!station) return bad('Unbekannter Sender');
    await playStation(station);
  }));

  router.post('/radio/stop', action(async () => {
    await gateway.call('beamer_stop_radio');
    now = null;
  }));

  router.post('/youtube', action(async ({ video }) => {
    const v = clip(video, 300);
    if (!v) return bad('YouTube-Link fehlt');
    await stopRadioFirst();
    await play('beamer_play_youtube', { video: v }, { kind: 'youtube', label: 'YouTube-Video' });
  }));

  router.post('/text', action(async ({ title, text }) => {
    const t = clip(title, 200);
    if (!t) return bad('Text fehlt');
    await play('beamer_show_text', { title: t, text: clip(text, 1000) }, { kind: 'text', label: t });
  }));

  router.post('/url', action(async ({ url }) => {
    const u = clip(url, 2000);
    if (!/^https:\/\//i.test(u)) return bad('Nur https-Adressen');
    await play('beamer_show_url', { url: u }, { kind: 'url', label: u.replace(/^https:\/\//i, '').slice(0, 60) });
  }));

  router.post('/app', action(async ({ app }) => {
    if (!APPS.includes(app)) return bad('Unbekannte App');
    await stopRadioFirst();
    await play('beamer_open_app', { app }, { kind: 'app', id: app, label: app });
  }));

  router.post('/share/start', action(async ({ offer, kind }) => {
    if (typeof offer !== 'string' || !offer.startsWith('v=0') || offer.length > 24000) return bad('Angebot ungültig');
    if (now?.kind !== 'share') resume = now && replay ? { now, replay } : null;
    const session = await gateway.call('beamer_share_start', { offer });
    now = { kind: 'share', label: kind === 'camera' ? 'Kamera' : 'Bildschirmfreigabe' };
    return { session };
  }));

  // Stoppen je nach Inhalt: Radio in BH Screen beenden, alles andere endet mit dem Sprung auf die Startseite.
  router.post('/stop', action(async () => {
    if (now?.kind === 'share') { await endShare(); return; }
    await gateway.call('beamer_home');
    now = null;
  }));

  router.post('/share/answer', action(async ({ session }) => {
    if (typeof session !== 'string' || !/^[0-9a-f]{18}$/.test(session)) return bad('Sitzung ungültig');
    return { answer: await gateway.call('beamer_share_answer', { session }) };
  }));

  // Nach der Freigabe läuft wieder, was vorher lief.
  async function endShare() {
    const back = resume; resume = null;
    if (back) { await gateway.call(back.replay.tool, back.replay.args); now = back.now; replay = back.replay; return; }
    await gateway.call('beamer_stop_radio');
    now = null; replay = null;
  }
  router.post('/share/stop', action(endShare));

  router.post('/key', action(async ({ key }) => {
    if (!KEYS.includes(key)) return bad('Unbekannte Taste');
    await gateway.call('beamer_press', { key });
    if (key === 'KEY_HOME') now = null;
  }));

  router.post('/power', action(async ({ state }) => {
    if (state !== 'on' && state !== 'off') return bad('Ein oder Aus');
    await gateway.call('beamer_power', { state });
    if (state === 'off') now = null; else gateway.call('beamer_home').catch(() => {});
  }));

  router.commands = {
    radio: (id) => { const s = byId(STATIONS, id); return s ? playStation(s) : null; },
    mood: (id) => { const m = byId(MOODS, id); return m ? playMood(m) : null; },
  };
  return router;
}

module.exports = { buildRouter };
