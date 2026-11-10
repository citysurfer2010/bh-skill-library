'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.BH_FAMILY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-family-'));
const b = require('../lib/birthdays.js');
const d = require('../lib/on-this-day.js');

test('Geburtstage: Eingabe wird geprüft, Datei nur für den Dienst lesbar', () => {
  assert.equal(b.add('A', 'kaputt'), null);
  assert.deepEqual(b.add('Anna Muster', '2015-11-14'), { name: 'Anna Muster', date: '2015-11-14' });
  assert.equal(fs.statSync(path.join(process.env.BH_FAMILY_DIR, 'birthdays.db')).mode & 0o777, 0o600);
  b.remove('Anna Muster'); assert.deepEqual(b.load(), []);
});

test('Geburtstage: Fenster 7 Tage, nur Vorname und Alter, über den Jahreswechsel', () => {
  const list = [{ name: 'Anna Muster', date: '2015-11-14' }, { name: 'Eva', date: '2015-11-20' }, { name: 'Ben', date: '2000-11-09' }, { name: 'Cleo', date: '2000-12-30' }, { name: 'Dora', date: '2010-01-02' }];
  const now = new Date('2026-11-09T10:00:00+01:00');
  assert.deepEqual(b.upcoming(now, list), [{ name: 'Ben', inDays: 0, age: 26 }, { name: 'Anna', inDays: 5, age: 11 }]);
  assert.deepEqual(b.upcoming(new Date('2026-12-28T10:00:00+01:00'), list).map((x) => [x.name, x.age]), [['Cleo', 26], ['Dora', 17]]);
  assert.doesNotMatch(JSON.stringify(b.upcoming(now, list)), /2015|date/);
});

test('An diesem Tag: nur Schönes, ohne Trennzeichen, höchstens drei', () => {
  const out = d.select({
    selected: [{ year: 1980, text: 'Die Forscherin stirbt erstmals in Paris.' }, { year: 1986, text: 'Die Spiele­konsole kommt erstmals nach Europa (Bild).' }],
    events: [{ year: 1950, text: 'Der Krieg beginnt mit dem ersten Film.' }, { year: 1961, text: 'Das Ampelmännchen wird erfunden.' }, { year: 2000, text: 'Der Minister eröffnet die Brücke.' }, { year: 1900, text: 'Ein ganz normaler Dienstag.' }],
    births: [{ year: 1970, text: 'Anna Beispiel, deutsche Schauspielerin', pages: [{ extract: 'lang genug' }] }, { year: 1800, text: 'Alt Mann, Maler', pages: [{ extract: 'sehr sehr sehr lang' }] }],
  });
  assert.deepEqual(out, { facts: [{ year: 1961, text: 'Das Ampelmännchen wird erfunden.' }, { year: 1986, text: 'Die Spielekonsole kommt erstmals nach Europa.' }], born: { year: 1970, text: 'Anna Beispiel, deutsche Schauspielerin' } });
});

test('An diesem Tag: Ministerium ist erlaubt, Minister und Waffen nicht', () => {
  const out = d.select({ events: [{ year: 1961, text: 'Beim Ministerium wird das Ampelmännchen eingereicht.' }, { year: 1962, text: 'Der Außenminister eröffnet die Brücke.' }, { year: 1914, text: 'Der Erfinder erhält ein Patent auf die Gasmaske.' }] });
  assert.deepEqual(out.facts.map((f) => f.year), [1961]);
});

test('An diesem Tag: höchstens ein Abruf pro Tag, nur Monat und Tag in der Adresse', async () => {
  let calls = 0; let seen;
  const load = async (u) => { calls += 1; seen = u; return { ok: true, json: async () => ({ selected: [{ year: 1986, text: 'Erstmals ein Film.' }], events: [], births: [] }) }; };
  const now = new Date('2026-11-22T09:00:00+01:00');
  assert.equal(await d.prepare(now, load), true);
  assert.equal(await d.prepare(now, load), false);
  assert.equal(calls, 1); assert.match(seen, /\/all\/11\/22$/);
  assert.equal(d.forToday(now).facts.length, 1);
  assert.equal(d.forToday(new Date('2026-11-23T09:00:00+01:00')), null);
});

test('Alte birthdays.json wird einmalig übernommen, vorhandene Einträge bleiben', () => {
  const { reset } = require('../lib/db.js');
  const dir = process.env.BH_FAMILY_DIR; const legacy = path.join(dir, 'birthdays.json');
  reset(); for (const s of ['', '-wal', '-shm']) fs.rmSync(path.join(dir, `birthdays.db${s}`), { force: true });
  fs.writeFileSync(legacy, JSON.stringify([{ name: 'Alt', date: '2000-01-02' }]));
  assert.deepEqual(b.load(), [{ name: 'Alt', date: '2000-01-02' }]);
  assert.equal(fs.existsSync(legacy), false); assert.equal(fs.existsSync(`${legacy}.imported`), true);
  fs.writeFileSync(legacy, JSON.stringify([{ name: 'Neu', date: '2001-01-02' }]));
  reset(); assert.deepEqual(b.load(), [{ name: 'Alt', date: '2000-01-02' }]);
  fs.rmSync(legacy, { force: true }); b.remove('Alt');
});
