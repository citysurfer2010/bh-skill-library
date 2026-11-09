'use strict';
/** Family birthdays. The data lives only on the server, never in the repo; only name, age and days away go to the Beamer. */
const fs = require('fs');
const path = require('path');

const dir = () => process.env.BH_FAMILY_DIR || '/tmp/bh-family';
const FILE = () => path.join(dir(), 'birthdays.json');
const WINDOW_DAYS = 7;

function load() { try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return []; } }
function save(list) { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(list), { mode: 0o600 }); }

const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));

function add(name, date) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n || !validDate(String(date))) return null;
  const list = load().filter((b) => b.name !== n);
  list.push({ name: n, date });
  save(list);
  return { name: n, date };
}
function remove(name) { save(load().filter((b) => b.name !== name)); }

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
