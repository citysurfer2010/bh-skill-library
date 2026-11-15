'use strict';
/**
 * Bank fetch: connect (consent at the bank), map each bank account to a ledger account, fetch booked transactions.
 * Rules: at most one automatic fetch per account every 20 hours, 7 days overlap, only booked lines,
 * and lines already in the ledger from a CSV (same account, amount, ±3 days) are linked instead of added twice.
 */
const crypto = require('crypto');
const { getDb } = require('./db');
const bank = require('./bank-api');
const { toRows } = require('./bank-convert');
const { classify, hashOf } = require('./ledger');
const ledgerAccounts = require('./accounts');
const { BANKS, rank, labelFor } = require('./bank-names');

const MIN_GAP_MS = 20 * 3600_000;
const OVERLAP_DAYS = 7;
const FIRST_FROM = '2025-01-01'; // The spreadsheet ends with 2024; the first fetch closes the gap as far as the bank allows.
const STATE_TTL_MS = 30 * 60_000;
const now = () => new Date().toISOString();
const shiftDay = (d, days) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const mask = (iban) => (iban ? `${iban.slice(0, 4)} … ${iban.slice(-4)}` : '');

async function connect({ aspsp, user, redirectUrl }) {
  if (!BANKS.some((b) => b.name === aspsp)) throw new bank.BankError(400, 'Diese Bank wird nicht unterstützt');
  const db = getDb(); const state = crypto.randomBytes(24).toString('hex');
  db.prepare('DELETE FROM bank_states WHERE created_at < ?').run(new Date(Date.now() - STATE_TTL_MS).toISOString());
  db.prepare('INSERT INTO bank_states (state, aspsp, created_by, created_at) VALUES (?, ?, ?, ?)').run(state, aspsp, user, now());
  const { url } = await bank.startAuth({ aspsp, state, redirectUrl });
  return url;
}

async function finish({ code, state, user }) {
  const db = getDb();
  const st = db.prepare('SELECT * FROM bank_states WHERE state = ?').get(String(state || ''));
  if (!st || st.created_by !== user || Date.parse(st.created_at) < Date.now() - STATE_TTL_MS) throw new bank.BankError(400, 'Die Anmeldung bei der Bank ist abgelaufen. Bitte noch einmal verbinden.');
  db.prepare('DELETE FROM bank_states WHERE state = ?').run(st.state);
  const s = await bank.createSession(String(code || ''));
  db.prepare('INSERT OR REPLACE INTO bank_sessions (session_id, aspsp, valid_until, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(s.session_id, st.aspsp, s.access?.valid_until || null, 'active', user, now());
  const accounts = [];
  for (const a of [...(s.accounts || [])].sort((x, y) => rank(x) - rank(y))) {
    const iban = a.account_id?.iban || '';
    const old = db.prepare('SELECT label FROM bank_accounts WHERE aspsp = ? AND iban = ? AND iban != ?').get(st.aspsp, iban, '');
    // Renewing the consent gives new account uids; the ledger name stays with the IBAN.
    if (old) db.prepare('DELETE FROM bank_accounts WHERE aspsp = ? AND iban = ?').run(st.aspsp, iban);
    const label = old?.label || labelFor(st.aspsp, a);
    db.prepare('INSERT OR REPLACE INTO bank_accounts (uid, session_id, aspsp, iban, name, label, product, details, usage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.uid, s.session_id, st.aspsp, iban, String(a.name || '').slice(0, 80), label, a.product || null, a.details || null, a.usage || null, now());
    ledgerAccounts.ensure(label, ledgerAccounts.defaultScope(a));
    accounts.push(a.uid);
  }
  db.prepare("DELETE FROM bank_sessions WHERE session_id NOT IN (SELECT session_id FROM bank_accounts) AND session_id != ?").run(s.session_id);
  return { aspsp: st.aspsp, accounts };
}

/** Writes fetched rows: known bank ids are skipped, matching CSV lines get linked, the rest is new. */
function store(acc, rows) {
  const db = getDb(); let added = 0; let linked = 0; let known = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const imp = db.prepare('INSERT INTO imports (filename, format, account, rows, added, duplicates, created_by, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)').run(`${acc.aspsp} (Bankabruf)`, 'bank', acc.label, rows.length, 'bank', now());
    const byRef = db.prepare('SELECT 1 FROM transactions WHERE account = ? AND bank_ref = ?');
    const csv = db.prepare('SELECT id FROM transactions WHERE account = ? AND bank_ref IS NULL AND amount_cents = ? AND booked_on BETWEEN ? AND ? ORDER BY abs(julianday(booked_on) - julianday(?)), id LIMIT 1');
    const link = db.prepare('UPDATE transactions SET bank_ref = ? WHERE id = ?');
    const insert = db.prepare('INSERT OR IGNORE INTO transactions (account, booked_on, amount_cents, kind, text, counterparty, category, category_source, suggestion, note, hash, import_id, created_at, bank_ref, counterparty_iban) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const r of rows) {
      if (byRef.get(acc.label, r.ref)) { known += 1; continue; }
      const match = csv.get(acc.label, r.cents, shiftDay(r.date, -3), shiftDay(r.date, 3), r.date);
      if (match) { link.run(r.ref, match.id); linked += 1; continue; }
      const c = classify(r.counterparty);
      added += insert.run(acc.label, r.date, r.cents, r.kind, r.text, r.counterparty, c.category, c.source, c.suggestion, '', hashOf(acc.label, { ...r, text: `bank:${r.ref}` }, 1), imp.lastInsertRowid, now(), r.ref, r.counterpartyIban || null).changes;
    }
    db.prepare('UPDATE imports SET added = ?, duplicates = ? WHERE id = ?').run(added, rows.length - added, imp.lastInsertRowid);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { added, linked, known };
}

/** The booked end-of-day balance first (CLBD), otherwise what the bank calls available or expected. */
const BALANCE_ORDER = ['CLBD', 'ITBD', 'ITAV', 'CLAV', 'XPCD', 'OPBD'];
async function storeBalance(uid) {
  const b = await bank.balances(uid).catch(() => null);
  const list = (b?.balances || []).filter((x) => x.balance_amount && x.balance_amount.amount != null);
  if (!list.length) return;
  const pick = list.slice().sort((x, y) => (BALANCE_ORDER.indexOf(x.balance_type) + 99) % 99 - (BALANCE_ORDER.indexOf(y.balance_type) + 99) % 99)[0];
  const cents = Math.round(Number(pick.balance_amount.amount) * 100);
  if (!Number.isFinite(cents)) return;
  getDb().prepare('UPDATE bank_accounts SET balance_cents = ?, balance_type = ?, balance_on = ? WHERE uid = ?').run(cents, pick.balance_type || '', pick.reference_date || new Date().toISOString().slice(0, 10), uid);
}

/**
 * Without a fresh consent banks give at most 90 days (DKB answers "Wrong transactions period requested").
 * Only the very first fetch of an account, right after connecting, may reach further back.
 */
const BACKGROUND_DAYS = 89;
const backgroundFloor = () => shiftDay(new Date().toISOString().slice(0, 10), -BACKGROUND_DAYS);
function dateFrom(acc) {
  const db = getDb();
  const lastBank = db.prepare('SELECT max(booked_on) AS d FROM transactions WHERE account = ? AND bank_ref IS NOT NULL').get(acc.label).d;
  const from = lastBank ? shiftDay(lastBank, -OVERLAP_DAYS) : FIRST_FROM;
  return acc.last_sync_at && from < backgroundFloor() ? backgroundFloor() : from;
}

async function syncAccount(acc, { force = false, psuIp } = {}) {
  const db = getDb();
  if (!force && acc.last_sync_at && Date.now() - Date.parse(acc.last_sync_at) < MIN_GAP_MS) return { uid: acc.uid, skipped: true };
  try {
    // Keeps product and description current; a scope is only guessed for an account that has none yet.
    const d = await bank.details(acc.uid).catch(() => null);
    if (d) {
      db.prepare('UPDATE bank_accounts SET product = ?, details = ?, usage = ? WHERE uid = ?').run(d.product || null, d.details || null, d.usage || null, acc.uid);
      ledgerAccounts.ensure(acc.label, ledgerAccounts.defaultScope(d));
    }
    await storeBalance(acc.uid);
    const list = []; let continuation; let pages = 0; let from = dateFrom(acc);
    do {
      let page;
      try { page = await bank.transactions(acc.uid, { dateFrom: from, continuation, psuIp }); } catch (e) {
        if (pages || !/period/i.test(e.message) || from >= backgroundFloor()) throw e;
        from = backgroundFloor(); page = await bank.transactions(acc.uid, { dateFrom: from, continuation, psuIp }); // the bank allows only 90 days here
      }
      list.push(...(page.transactions || [])); continuation = page.continuation_key; pages += 1;
    } while (continuation && pages < 100);
    const rows = toRows(list); const result = store(acc, rows);
    const first = rows.reduce((m, r) => (!m || r.date < m ? r.date : m), null);
    db.prepare('UPDATE bank_accounts SET last_sync_at = ?, last_error = NULL, first_booked_on = COALESCE(first_booked_on, ?) WHERE uid = ?').run(now(), first, acc.uid);
    return { uid: acc.uid, label: acc.label, ...result };
  } catch (e) {
    db.prepare('UPDATE bank_accounts SET last_sync_at = ?, last_error = ? WHERE uid = ?').run(now(), String(e.message).slice(0, 300), acc.uid);
    if (e.expired) db.prepare("UPDATE bank_sessions SET status = 'expired' WHERE session_id = ?").run(acc.session_id);
    return { uid: acc.uid, label: acc.label, error: e.message };
  }
}

let running = null;
const isRunning = () => !!running;
/** One run at a time; a second caller waits for the running one. */
function syncAll(opts = {}) {
  if (running) return running;
  running = (async () => {
    const accs = getDb().prepare("SELECT a.* FROM bank_accounts a JOIN bank_sessions s ON s.session_id = a.session_id WHERE s.status = 'active' AND (s.valid_until IS NULL OR s.valid_until > ?) ORDER BY a.created_at").all(now());
    const out = [];
    for (const a of accs) out.push(await syncAccount(a, opts));
    if (out.some((o) => o.added)) { require('./transfers').detect(); require('./text-rules').detect(); }
    return out;
  })().finally(() => { running = null; });
  return running;
}

function status() {
  const db = getDb();
  const accounts = db.prepare('SELECT a.uid, a.aspsp, a.iban, COALESCE(a.details, a.product, a.name) AS name, a.product, a.details, a.label, a.first_booked_on, a.last_sync_at, a.last_error, s.valid_until, s.status FROM bank_accounts a JOIN bank_sessions s ON s.session_id = a.session_id ORDER BY a.aspsp, a.label').all()
    .map(({ iban, ...a }) => ({ ...a, iban: mask(iban), status: a.status === 'active' && a.valid_until && a.valid_until < now() ? 'expired' : a.status }));
  return { configured: bank.configured(), banks: BANKS.map((b) => b.name), accounts, running: isRunning() };
}

/**
 * Moves an account's bank lines to another ledger name. Links to CSV lines under the old name are dropped,
 * and moved lines that a CSV already holds under the new name are merged into those (the CSV keeps its category).
 */
function rename(uid, label) {
  const l = String(label || '').trim();
  if (!l || l.length > 60) throw new bank.BankError(400, 'Name 1 bis 60 Zeichen');
  const db = getDb(); const acc = db.prepare('SELECT * FROM bank_accounts WHERE uid = ?').get(uid);
  if (!acc) return false;
  if (l === acc.label) return true;
  if (db.prepare('SELECT 1 FROM bank_accounts WHERE label = ? AND uid != ?').get(l, uid)) throw new bank.BankError(400, 'Dieser Kontoname gehört schon zu einem anderen Bankkonto');
  db.exec('BEGIN IMMEDIATE');
  try {
    const own = "account = ? AND bank_ref IS NOT NULL AND import_id IN (SELECT id FROM imports WHERE format = 'bank')";
    const moved = db.prepare(`SELECT id, booked_on, amount_cents, bank_ref FROM transactions WHERE ${own}`).all(acc.label);
    db.prepare(`UPDATE transactions SET bank_ref = NULL WHERE account = ? AND bank_ref IS NOT NULL AND NOT (${own.replace('account = ? AND ', '')})`).run(acc.label);
    const csv = db.prepare('SELECT id FROM transactions WHERE account = ? AND bank_ref IS NULL AND amount_cents = ? AND booked_on BETWEEN ? AND ? ORDER BY abs(julianday(booked_on) - julianday(?)), id LIMIT 1');
    for (const m of moved) {
      const hit = csv.get(l, m.amount_cents, shiftDay(m.booked_on, -3), shiftDay(m.booked_on, 3), m.booked_on);
      if (hit) {
        db.prepare('DELETE FROM transactions WHERE id = ?').run(m.id);
        db.prepare('UPDATE transactions SET bank_ref = ? WHERE id = ?').run(m.bank_ref, hit.id);
      } else db.prepare('UPDATE transactions SET account = ? WHERE id = ?').run(l, m.id);
    }
    db.prepare('UPDATE bank_accounts SET label = ? WHERE uid = ?').run(l, uid);
    const scope = db.prepare('SELECT scope FROM accounts WHERE name = ?').get(acc.label)?.scope;
    if (scope) db.prepare('INSERT OR IGNORE INTO accounts (name, scope, updated_at) VALUES (?, ?, ?)').run(l, scope, now());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return true;
}

async function disconnect(uid) {
  const db = getDb(); const acc = db.prepare('SELECT * FROM bank_accounts WHERE uid = ?').get(uid);
  if (!acc) return false;
  db.prepare('DELETE FROM bank_accounts WHERE uid = ?').run(uid);
  if (!db.prepare('SELECT 1 FROM bank_accounts WHERE session_id = ?').get(acc.session_id)) {
    db.prepare('DELETE FROM bank_sessions WHERE session_id = ?').run(acc.session_id);
    await bank.deleteSession(acc.session_id).catch(() => {}); // Already gone at the bank is fine.
  }
  return true;
}

module.exports = { isRunning, BANKS, connect, finish, store, syncAccount, syncAll, status, rename, disconnect, MIN_GAP_MS };
