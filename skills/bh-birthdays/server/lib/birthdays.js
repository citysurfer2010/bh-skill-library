'use strict';
/** Family birthdays. The data lives only on the server, never in the repo; only name, age and days away go to the Beamer. */
const { db } = require('./db.js');

const WINDOW_DAYS = 7;

function load() { return db().prepare('SELECT name, date FROM birthdays ORDER BY name').all().map((b) => ({ ...b })); }

const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));

function add(name, date) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n || !validDate(String(date))) return null;
  db().prepare('INSERT INTO birthdays (name, date) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET date = excluded.date').run(n, date);
  return { name: n, date };
}
function remove(name) { db().prepare('DELETE FROM birthdays WHERE name = ?').run(name); }

function todayBerlin(now) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }

/** Who has a birthday in the next seven days, nearest first. */
function upcoming(now = new Date(), list = load()) {
  const today = todayBerlin(now); const base = Date.parse(`${today}T12:00:00Z`); const year = Number(today.slice(0, 4));
  return list.map((b) => {
    let y = year; let at = Date.parse(`${y}${b.date.slice(4)}T12:00:00Z`);
    if (at < base) { y += 1; at = Date.parse(`${y}${b.date.slice(4)}T12:00:00Z`); }
    return { name: b.name.split(' ')[0], inDays: Math.round((at - base) / 864e5), age: y - Number(b.date.slice(0, 4)) };
  }).filter((b) => b.inDays <= WINDOW_DAYS).sort((a, b) => a.inDays - b.inDays);
}

module.exports = { load, add, remove, upcoming };
