'use strict';
/** Zottel API. Every chat and card belongs to the signed-in user; foreign ids answer 404. */
const express = require('express');
const store = require('../lib/store');
const agent = require('../lib/agent');
const { subscribe } = require('../lib/events');

const MAX_TEXT = 20_000;
const PING_MS = 15_000;

// User apps live on subdomains of the same site, so a cookie alone does not prove where a request came from.
function sameOrigin(req, res, next) {
  if (req.method === 'GET') return next();
  const origin = req.get('origin');
  if (!origin) return process.env.NODE_ENV === 'production' ? res.status(403).json({ error: 'Herkunft fehlt' }) : next();
  try { if (new URL(origin).host === req.get('host')) return next(); } catch { /* falls through */ }
  return res.status(403).json({ error: 'Falsche Herkunft' });
}

function buildRouter() {
  const r = express.Router();
  r.use(sameOrigin);
  const owned = (req, res, next) => {
    req.chat = store.chatOf(req.user.email, req.params.id);
    return req.chat ? next() : res.status(404).json({ error: 'Gespräch nicht gefunden' });
  };

  r.get('/chats', (req, res) => res.json({ chats: store.listChats(req.user.email) }));
  r.post('/chats', (req, res) => res.status(201).json(store.createChat(req.user.email)));
  r.get('/chats/:id', owned, (req, res) => res.json({
    chat: { id: req.chat.id, title: req.chat.title, mode: req.chat.mode }, messages: store.visibleMessages(req.chat.id), cards: store.cardsOf(req.chat.id), steps: store.stepsOf(req.chat.id), busy: agent.isRunning(req.chat.id),
  }));
  r.patch('/chats/:id', owned, (req, res) => {
    const { title, mode } = req.body || {};
    if (mode !== undefined) { if (!['do', 'look'].includes(mode)) return res.status(400).json({ error: 'Unbekannter Modus' }); store.setMode(req.chat.id, mode); }
    if (typeof title === 'string' && title.trim()) store.setTitle(req.chat.id, title.trim().slice(0, 80));
    return res.status(204).end();
  });
  r.delete('/chats/:id', owned, (req, res) => { store.deleteChat(req.chat.id); res.status(204).end(); });

  r.post('/chats/:id/messages', owned, (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > MAX_TEXT) return res.status(400).json({ error: 'Bitte einen Text angeben' });
    if (agent.isRunning(req.chat.id)) return res.status(409).json({ error: 'Zottel arbeitet noch' });
    if (store.pendingCount(req.chat.id)) return res.status(409).json({ error: 'Bitte zuerst die offene Karte beantworten' });
    agent.sendMessage(req.chat, req.user.email, text).catch((e) => console.error(`[zottel] ${e.message}`));
    return res.status(202).end();
  });
  r.post('/chats/:id/stop', owned, (req, res) => { agent.stop(req.chat.id); res.status(204).end(); });

  r.get('/chats/:id/events', owned, (req, res) => {
    // The web entry would otherwise hold the stream back until it is finished.
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const off = subscribe(req.chat.id, send);
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    req.on('close', () => { clearInterval(ping); off(); });
  });

  r.post('/cards/:id', (req, res) => {
    const card = store.cardById(req.params.id);
    if (!card || !store.chatOf(req.user.email, card.chat_id)) return res.status(404).json({ error: 'Karte nicht gefunden' });
    if (card.status !== 'pending') return res.status(409).json({ error: 'Diese Karte ist schon beantwortet' });
    const { decision } = req.body || {};
    if (!['once', 'always', 'reject'].includes(decision)) return res.status(400).json({ error: 'Unbekannte Antwort' });
    agent.decide(card, req.user.email, decision).catch((e) => console.error(`[zottel] ${e.message}`));
    return res.status(202).end();
  });

  r.get('/setup', (req, res) => { const p = store.profileOf(req.user.email); res.json({ done: !!p, chatId: p?.setup_chat_id || null }); });
  r.post('/setup', (req, res) => {
    const p = store.profileOf(req.user.email);
    if (p && !req.body?.restart && store.chatOf(req.user.email, p.setup_chat_id)) return res.json({ chatId: p.setup_chat_id });
    return res.status(201).json({ chatId: agent.startSetup(req.user.email).id });
  });

  r.get('/memories', (req, res) => res.json({ memories: store.memoriesOf(req.user.email) }));
  r.delete('/memories/:id', (req, res) => (store.forgetMemory(req.user.email, Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'Nicht gefunden' })));
  return r;
}

module.exports = { buildRouter };
