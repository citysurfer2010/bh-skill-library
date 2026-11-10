'use strict';
/**
 * Learning from corrections. A rule starts as a suggestion and becomes active with the second signal
 * or when the person adopts it; two contradictions pause it. At most five active rules reach the prompt.
 */
const { getDb } = require('./db');

const ACTIVE_AFTER = 2;
const PAUSE_AFTER = 2;
const MAX_IN_PROMPT = 5;
const MAX_NEW_PER_DAY = 5;
const now = () => new Date().toISOString();
const plain = (r) => (r ? { ...r } : null);
const cleanArea = (a) => (/^[a-z][a-z0-9]{1,20}$/.test(String(a)) ? String(a) : 'general');

const get = (email, id) => plain(getDb().prepare('SELECT * FROM lessons WHERE id = ? AND user_email = ?').get(id, email));
const list = (email) => getDb().prepare("SELECT * FROM lessons WHERE user_email = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'candidate' THEN 1 ELSE 2 END, signals DESC, updated_at DESC").all(email).map(plain);

/** A correction signal: reinforces an existing suggestion by id, or starts a new one. */
function learn(email, { text, area, id }) {
  if (id) {
    const l = get(email, Number(id));
    if (!l) return { error: 'Diese Regel gibt es nicht.' };
    const signals = l.signals + 1;
    const status = l.status === 'candidate' && signals >= ACTIVE_AFTER ? 'active' : l.status;
    getDb().prepare('UPDATE lessons SET signals = ?, status = ?, updated_at = ? WHERE id = ?').run(signals, status, now(), l.id);
    return get(email, l.id);
  }
  const t = String(text || '').trim().slice(0, 300);
  if (t.length < 8) return { error: 'Die Regel ist zu kurz.' };
  const today = getDb().prepare("SELECT count(*) AS n FROM lessons WHERE user_email = ? AND created_at >= date('now')").get(email).n;
  if (today >= MAX_NEW_PER_DAY) return { error: 'Heute sind schon genug neue Regeln entstanden.' };
  const r = getDb().prepare("INSERT INTO lessons (user_email, area, text, status, signals, contradictions, created_at, updated_at) VALUES (?, ?, ?, 'candidate', 1, 0, ?, ?)").run(email, cleanArea(area), t, now(), now());
  return get(email, Number(r.lastInsertRowid));
}

function contradict(email, id) {
  const l = get(email, Number(id)); if (!l) return null;
  const n = l.contradictions + 1;
  getDb().prepare('UPDATE lessons SET contradictions = ?, status = ?, updated_at = ? WHERE id = ?').run(n, n >= PAUSE_AFTER ? 'paused' : l.status, now(), l.id);
  return get(email, l.id);
}

/** Decisions of the person always win over counting. */
function setStatus(email, id, status) {
  if (!['active', 'paused'].includes(status)) return false;
  if (status === 'active' && getDb().prepare("SELECT count(*) AS n FROM lessons WHERE user_email = ? AND status = 'active' AND id != ?").get(email, Number(id)).n >= MAX_IN_PROMPT) return false;
  return getDb().prepare('UPDATE lessons SET status = ?, contradictions = 0, updated_at = ? WHERE id = ? AND user_email = ?').run(status, now(), Number(id), email).changes > 0;
}
const remove = (email, id) => getDb().prepare('DELETE FROM lessons WHERE id = ? AND user_email = ?').run(Number(id), email).changes > 0;

function forPrompt(email) {
  const pick = (status) => getDb().prepare('SELECT id, area, text FROM lessons WHERE user_email = ? AND status = ? ORDER BY signals DESC, updated_at DESC LIMIT ?').all(email, status, MAX_IN_PROMPT).map(plain);
  return { active: pick('active'), candidates: pick('candidate') };
}

module.exports = { MAX_ACTIVE: MAX_IN_PROMPT, learn, contradict, setStatus, remove, list, forPrompt, get };
