'use strict';
/** Bank fetch (Enable Banking) against a fake API: signing, conversion, CSV linking, paging, the 20 h rule, expiry, names. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-bank-'));
process.env.DATA_DIR = dir;
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.writeFileSync(path.join(dir, 'key.pem'), privateKey.export({ type: 'pkcs1', format: 'pem' }));
process.env.ENABLE_BANKING_APP_ID = 'app-123';
process.env.ENABLE_BANKING_KEY_FILE = path.join(dir, 'key.pem');

const { getDb } = require('../lib/db');
const bank = require('../lib/bank-api');
const { toRow, toRows } = require('../lib/bank-convert');
const sync = require('../lib/bank-sync');
const ledger = require('../lib/ledger');

const calls = [];
let reply = () => ({});
bank._setFetch(async (url, init) => {
  calls.push({ url, init }); const out = await reply(url, init);
  return { ok: !out.status, status: out.status || 200, json: async () => out.body || out };
});
const tx = (ref, date, amount, ind, extra = {}) => ({ entry_reference: ref, booking_date: date, transaction_amount: { amount: String(amount), currency: 'EUR' }, credit_debit_indicator: ind, remittance_information: [`Zweck ${ref}`], ...extra });
const rowsOf = (label) => getDb().prepare('SELECT * FROM transactions WHERE account = ? ORDER BY booked_on, id').all(label);

async function connectWith(accounts, user = 'm@b.de') {
  reply = (url) => (url.endsWith('/auth') ? { url: 'https://bank.example/login' } : { session_id: `s-${calls.length}`, access: { valid_until: '2099-01-01T00:00:00Z' }, accounts });
  assert.equal(await sync.connect({ aspsp: 'Comdirect', user, redirectUrl: 'https://x/cb' }), 'https://bank.example/login');
  const state = JSON.parse(calls.at(-1).init.body).state;
  return sync.finish({ code: 'c', state, user });
}

test('JWT is signed with the app key and names the app', () => {
  const [h, p, s] = bank.token({ appId: 'app-123', key: privateKey.export({ type: 'pkcs1', format: 'pem' }) }).split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).kid, 'app-123');
  assert.equal(JSON.parse(Buffer.from(p, 'base64url')).aud, 'api.enablebanking.com');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url')));
});

test('conversion: sign from debit/credit, partner by direction, content ref numbered for equal lines', () => {
  const out = toRow(tx('r1', '2025-02-03', '12.50', 'DBIT', { creditor: { name: 'REWE' } }));
  assert.deepEqual([out.date, out.cents, out.counterparty, out.ref], ['2025-02-03', -1250, 'REWE', 'r1']);
  assert.equal(toRow(tx('r2', '2025-02-03', 100, 'CRDT', { debtor: { name: 'Arbeitgeber' } })).cents, 10000);
  const same = { booking_date: '2025-02-04', transaction_amount: { amount: '5' }, credit_debit_indicator: 'DBIT', remittance_information: ['Kaffee'] };
  const [a, b] = toRows([same, same]);
  assert.ok(a.ref.startsWith('c:')); assert.equal(b.ref, `${a.ref}:2`);
  assert.equal(toRow({ transaction_amount: { amount: '1' } }), null);
});

test('connect: only known banks, state bound to the person, names by account type', async () => {
  await assert.rejects(sync.connect({ aspsp: 'Fremdbank', user: 'm@b.de', redirectUrl: 'x' }), /nicht unterstützt/);
  reply = () => ({ url: 'u' });
  await sync.connect({ aspsp: 'Comdirect', user: 'm@b.de', redirectUrl: 'x' });
  const state = JSON.parse(calls.at(-1).init.body).state;
  await assert.rejects(sync.finish({ code: 'c', state, user: 'other@b.de' }), /abgelaufen/);
  const { accounts } = await connectWith([
    { uid: 'u-giro', account_id: { iban: 'DE001111' }, cash_account_type: 'CACC', name: 'Girokonto' },
    { uid: 'u-card', account_id: {}, cash_account_type: 'CARD', name: 'Visa' },
    { uid: 'u-tg', account_id: { iban: 'DE009999' }, cash_account_type: 'SVGS', name: 'Tagesgeld' }]);
  assert.equal(accounts.length, 3);
  const labels = Object.fromEntries(sync.status().accounts.map((a) => [a.uid, a.label]));
  assert.deepEqual([labels['u-giro'], labels['u-card'], labels['u-tg']], ['comdirect', 'CD-CCM', 'comdirect Sparkonto']);
  assert.equal(sync.status().accounts.find((a) => a.uid === 'u-giro').iban, 'DE00 … 1111');
  assert.deepEqual(sync.status().banks, ['Comdirect', 'BBBank', 'DKB', 'PayPal']);
});

test('names: the current account gets the usual name even when the bank lists savings first as CACC', async () => {
  const { accounts } = await connectWith([
    { uid: 'x-tg', account_id: { iban: 'DE771405' }, cash_account_type: 'CACC', product: 'Tagesgeldkonto', details: 'Tagesgeld PLUS-Konto', name: 'M B' },
    { uid: 'x-giro', account_id: { iban: 'DE771400' }, cash_account_type: 'CACC', product: 'Girokonto', details: 'Girokonto', name: 'M B' }]);
  assert.equal(accounts.length, 2);
  const byUid = Object.fromEntries(sync.status().accounts.map((a) => [a.uid, a]));
  // 'comdirect' already belongs to u-giro above, so the new current account falls back; savings never take a base name.
  assert.equal(byUid['x-tg'].label, 'comdirect Tagesgeldkonto'); assert.equal(byUid['x-tg'].name, 'Tagesgeld PLUS-Konto');
  assert.equal(byUid['x-giro'].label, 'comdirect 1400');
  for (const uid of ['x-tg', 'x-giro']) await sync.disconnect(uid);
});

test('fetch: pages, links CSV lines, adds new ones, second run with overlap adds nothing', async () => {
  ledger.importRows({ filename: 'a.csv', format: 'comdirect', account: 'comdirect', rows: [{ date: '2025-01-10', cents: -4000, text: 'Strom alt', counterparty: 'Stadtwerke' }], user: 't' });
  const pages = [{ transactions: [tx('b1', '2025-01-11', '40', 'DBIT')], continuation_key: 'k2' }, { transactions: [tx('b2', '2025-01-12', '9.99', 'DBIT', { creditor: { name: 'Netflix' } })] }];
  reply = (url) => (url.includes('u-giro') ? (url.includes('continuation_key=k2') ? pages[1] : pages[0]) : { transactions: [] });
  const res = await sync.syncAll({ force: true });
  const giro = res.find((r) => r.uid === 'u-giro');
  assert.deepEqual([giro.added, giro.linked], [1, 1]);
  assert.match(calls.find((c) => c.url.includes('u-giro')).url, /date_from=2025-01-01/);
  const rows = rowsOf('comdirect');
  assert.equal(rows.length, 2); assert.equal(rows[0].text, 'Strom alt'); assert.equal(rows[0].bank_ref, 'b1');
  const again = (await sync.syncAll({ force: true })).find((r) => r.uid === 'u-giro');
  assert.deepEqual([again.added, again.known], [0, 2]);
  assert.match(calls.filter((c) => c.url.includes('u-giro')).at(-2).url, /date_from=2025-01-05/);
});

test('fetch: at most every 20 hours unless asked; CSV after bank fetch counts as duplicate', async () => {
  const n = calls.length;
  assert.ok((await sync.syncAll()).every((r) => r.skipped));
  assert.equal(calls.length, n);
  const r = ledger.importRows({ filename: 'b.csv', format: 'comdirect', account: 'comdirect', rows: [{ date: '2025-01-12', cents: -999, text: 'Netflix CSV', counterparty: 'Netflix' }], user: 't' });
  assert.deepEqual([r.added, r.duplicates], [0, 1]);
});

test('expired consent: error kept on the account, session marked, no more automatic fetches', async () => {
  reply = (url) => (url.includes('u-tg') ? { status: 401, body: { message: 'Session expired' } } : { transactions: [] });
  const out = await sync.syncAll({ force: true });
  assert.match(out.find((o) => o.uid === 'u-tg').error, /expired/);
  const tg = sync.status().accounts.find((a) => a.uid === 'u-tg');
  assert.equal(tg.status, 'expired'); assert.match(tg.last_error, /expired/);
  assert.equal((await sync.syncAll({ force: true })).length, 0);
});

test('rename moves bank lines and merges with CSV lines under the new name; names stay unique', () => {
  ledger.importRows({ filename: 'c.csv', format: 'comdirect', account: 'Giro neu', rows: [{ date: '2025-01-12', cents: -999, text: 'Netflix alt', counterparty: 'Netflix' }], user: 't' });
  assert.throws(() => sync.rename('u-giro', 'CD-CCM'), /anderen Bankkonto/);
  assert.ok(sync.rename('u-giro', 'Giro neu'));
  const moved = rowsOf('Giro neu');
  assert.equal(moved.length, 1); assert.equal(moved[0].text, 'Netflix alt'); assert.equal(moved[0].bank_ref, 'b2');
  const old = rowsOf('comdirect');
  assert.equal(old.length, 1); assert.equal(old[0].bank_ref, null);
  assert.equal(sync.rename('nope', 'x'), false);
});

test('disconnect keeps the transactions and ends the session at the bank with its last account', async () => {
  const before = getDb().prepare('SELECT count(*) AS n FROM transactions').get().n;
  reply = () => ({});
  const deletes = () => calls.filter((c) => c.init.method === 'DELETE').length; const start = deletes();
  for (const uid of ['u-giro', 'u-card']) assert.ok(await sync.disconnect(uid));
  assert.equal(deletes(), start);
  assert.ok(await sync.disconnect('u-tg'));
  assert.equal(deletes(), start + 1);
  assert.equal(getDb().prepare('SELECT count(*) AS n FROM transactions').get().n, before);
  assert.equal(sync.status().accounts.length, 0);
});
