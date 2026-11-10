'use strict';
/** Tools Zottel runs himself: memory, plan, routines and learning. */
const store = require('./store');
const routines = require('./routines');
const lessons = require('./lessons');
const { findTools } = require('./agent-tools');
const { publish } = require('./events');

const DAY_NAMES = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const describe = (r) => `${r.title}: ${r.days.length === 7 ? 'täglich' : r.days.map((d) => DAY_NAMES[d]).join(', ')} um ${r.time}${r.active ? '' : ' (pausiert)'} [${r.id}]`;

async function runLocal(chat, email, name, args) {
  if (name === 'find_tools') return findTools(email, args.query);
  if (name === 'remember') return `Gemerkt (Nr. ${store.addMemory(email, args.text)}).`;
  if (name === 'forget') return store.forgetMemory(email, Number(args.id)) ? 'Vergessen.' : 'Diesen Eintrag gibt es nicht.';
  if (name === 'show_steps') { store.setSteps(chat.id, args.steps || []); publish(chat.id, { type: 'steps', steps: store.stepsOf(chat.id) }); return 'Angezeigt.'; }
  if (name === 'routine_create') {
    try { const r = routines.create(email, args); return `Routine angelegt: ${describe(r)}. Erster Lauf: ${new Date(r.next_run).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}.`; } catch (e) { return `Fehler: ${e.message}`; }
  }
  if (name === 'routine_list') { const all = routines.list(email); return all.length ? all.map(describe).join('\n') : 'Keine Routinen.'; }
  if (name === 'routine_delete') return routines.remove(email, String(args.id)) ? 'Routine gelöscht.' : 'Diese Routine gibt es nicht.';
  if (name === 'learn') {
    const l = lessons.learn(email, args);
    if (l.error) return `Fehler: ${l.error}`;
    return l.status === 'active' ? `Regel ${l.id} ist jetzt aktiv.` : `Als Vorschlag ${l.id} notiert. Er wird aktiv, wenn es noch einmal vorkommt oder der User ihn übernimmt.`;
  }
  if (name === 'unlearn') { const l = lessons.contradict(email, args.id); return !l ? 'Diese Regel gibt es nicht.' : l.status === 'paused' ? `Regel ${l.id} ist pausiert.` : `Widerspruch zu Regel ${l.id} notiert.`; }
  return `Unbekanntes Werkzeug: ${name}`;
}

module.exports = { runLocal };
