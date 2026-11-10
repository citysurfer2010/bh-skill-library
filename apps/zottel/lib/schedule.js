'use strict';
/** Times of routines in Europe/Berlin, including the change to and from daylight saving time. */
const ZONE = 'Europe/Berlin';
const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function parts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

function berlinToUtc(day, time) {
  const guess = new Date(`${day}T${time}:00Z`);
  const p = parts(guess);
  const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

const validTime = (time) => TIME.test(String(time));
const validDays = (days) => Array.isArray(days) && days.length > 0 && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7);

/** Next start after `after`, or null if the rule is invalid. */
function nextRun(time, days, after = new Date()) {
  if (!validTime(time) || !validDays(days)) return null;
  for (let i = 0; i < 9; i++) {
    const p = parts(new Date(after.getTime() + i * 86_400_000));
    if (!days.includes(WEEKDAY[p.weekday])) continue;
    const at = berlinToUtc(`${p.year}-${p.month}-${p.day}`, time);
    if (at > after) return at;
  }
  return null;
}

module.exports = { nextRun, validTime, validDays };
