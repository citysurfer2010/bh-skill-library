'use strict';
/** Routines: a task Zottel does on his own at fixed times. Results land in a conversation of their own. */
const crypto = require('crypto');
const { getDb } = require('./db');
const { nextRun, validTime, validDays } = require('./schedule');

const MAX_PER_USER = 20;
const plain = (r) => (r ? { ...r, days: String(r.days).split(',').map(Number), active: !!r.active } : null);
const now = () => new Date().toISOString();

function create(email, { title, prompt, time, days }) {
  const t = String(title || '').trim().slice(0, 80); const p = String(prompt || '').trim().slice(0, 2000);
  if (!t || !p) throw new Error('Titel und Auftrag fehlen');
  if (!validTime(time) || !validDays(days)) throw new Error('Uhrzeit als HH:MM und Wochentage 1 bis 7 angeben');
  if (getDb().prepare('SELECT count(*) AS n FROM routines WHERE user_email = ?').get(email).n >= MAX_PER_USER) throw new Error(`Höchstens ${MAX_PER_USER} Routinen`);
  const id = crypto.randomBytes(8).toString('hex');
  getDb().prepare('INSERT INTO routines (id, user_email, title, prompt, time, days, active, next_run, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .run(id, email, t, p, time, [...new Set(days)].sort().join(','), nextRun(time, days).toISOString(), now());
  return get(email, id);
}

const get = (email, id) => plain(getDb().prepare('SELECT * FROM routines WHERE id = ? AND user_email = ?').get(id, email));
const list = (email) => getDb().prepare('SELECT * FROM routines WHERE user_email = ? ORDER BY time, title').all(email).map(plain);

function setActive(email, id, active) {
  const r = get(email, id); if (!r) return false;
  getDb().prepare('UPDATE routines SET active = ?, next_run = ? WHERE id = ?').run(active ? 1 : 0, active ? nextRun(r.time, r.days).toISOString() : null, id);
  return true;
}
const remove = (email, id) => getDb().prepare('DELETE FROM routines WHERE id = ? AND user_email = ?').run(id, email).changes > 0;

const due = (at = new Date()) => getDb().prepare('SELECT * FROM routines WHERE active = 1 AND next_run <= ? ORDER BY next_run LIMIT 20').all(at.toISOString()).map(plain);
// The next start always comes from now: after downtime a routine runs once, not once per missed slot.
function markRun(id, chatId, at = new Date()) {
  const r = plain(getDb().prepare('SELECT * FROM routines WHERE id = ?').get(id));
  getDb().prepare('UPDATE routines SET last_run = ?, chat_id = ?, next_run = ? WHERE id = ?').run(at.toISOString(), chatId, nextRun(r.time, r.days, at)?.toISOString() || null, id);
}

module.exports = { create, get, list, setActive, remove, due, markRun };
