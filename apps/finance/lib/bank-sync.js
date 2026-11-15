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

// Ledger names as in the old spreadsheet: the current account gets the bank's usual name, a card its card name.
const BANKS = [{ name: 'Comdirect', label: 'comdirect', card: 'CD-CCM' }, { name: 'BBBank', label: 'BBB' }, { name: 'DKB', label: 'DKB' }, { name: 'PayPal', label: 'PayPal' }];
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

const productOf = (a) => [a.product, a.details].filter(Boolean).join(' ');
/** Current accounts first, so they get the usual ledger name before any other account of the same bank. */
const rank = (a) => (/giro|current|privatkonto/i.test(productOf(a)) ? 0 : /tagesgeld|spar|festgeld/i.test(productOf(a)) ? 2 : 1);

/** A free ledger name for a new bank account: the usual name by account type first, then bank plus IBAN end. */
function labelFor(aspsp, account) {
  const db = getDb(); const b = BANKS.find((x) => x.name === aspsp) || { label: aspsp };
  const iban = account.account_id?.iban || ''; const type = account.cash_account_type || '';
  const taken = (l) => !!db.prepare('SELECT 1 FROM bank_accounts WHERE label = ?').get(l);
  // comdirect reports its Tagesgeld as CACC too; only the product name tells a current account from savings.
  const product = productOf(account);
  const savings = /tagesgeld|spar|festgeld|savings/i.test(product) || type === 'SVGS';
  const card = type === 'CARD' || /kredit|visa|card/i.test(product);
  const giro = /giro|current|privatkonto/i.test(product) || (!product && (!type || type === 'CACC'));
  const wanted = card && b.card ? b.card : !savings && !card && (giro || aspsp === 'PayPal') ? b.label : null;
  if (wanted && !taken(wanted)) return wanted;
  const alt = `${b.label} ${iban ? iban.slice(-4) : crypto.randomBytes(2).toString('hex')}`;
  return taken(alt) ? `${alt}-${crypto.randomBytes(2).toString('hex')}` : alt;
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
    db.prepare('INSERT OR REPLACE INTO bank_accounts (uid, session_id, aspsp, iban, name, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(a.uid, s.session_id, st.aspsp, iban, String(a.details || a.product || a.name || '').slice(0, 80), label, now());
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
    const insert = db.prepare('INSERT OR IGNORE INTO transactions (account, booked_on, amount_cents, kind, text, counterparty, category, category_source, suggestion, note, hash, import_id, created_at, bank_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const r of rows) {
      if (byRef.get(acc.label, r.ref)) { known += 1; continue; }
      const match = csv.get(acc.label, r.cents, shiftDay(r.date, -3), shiftDay(r.date, 3), r.date);
      if (match) { link.run(r.ref, match.id); linked += 1; continue; }
      const c = classify(r.counterparty);
      added += insert.run(acc.label, r.date, r.cents, r.kind, r.text, r.counterparty, c.category, c.source, c.suggestion, '', hashOf(acc.label, { ...r, text: `bank:${r.ref}` }, 1), imp.lastInsertRowid, now(), r.ref).changes;
    }
    db.prepare('UPDATE imports SET added = ?, duplicates = ? WHERE id = ?').run(added, rows.length - added, imp.lastInsertRowid);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { added, linked, known };
}

function dateFrom(acc) {
  const db = getDb();
  const lastBank = db.prepare('SELECT max(booked_on) AS d FROM transactions WHERE account = ? AND bank_ref IS NOT NULL').get(acc.label).d;
  return lastBank ? shiftDay(lastBank, -OVERLAP_DAYS) : FIRST_FROM;
}

async function syncAccount(acc, { force = false, psuIp } = {}) {
  const db = getDb();
  if (!force && acc.last_sync_at && Date.now() - Date.parse(acc.last_sync_at) < MIN_GAP_MS) return { uid: acc.uid, skipped: true };
  try {
    const list = []; let continuation; let pages = 0;
    do {
      const page = await bank.transactions(acc.uid, { dateFrom: dateFrom(acc), continuation, psuIp });
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
    return out;
  })().finally(() => { running = null; });
  return running;
}

function status() {
  const db = getDb();
  const accounts = db.prepare('SELECT a.uid, a.aspsp, a.iban, a.name, a.label, a.first_booked_on, a.last_sync_at, a.last_error, s.valid_until, s.status FROM bank_accounts a JOIN bank_sessions s ON s.session_id = a.session_id ORDER BY a.aspsp, a.label').all()
    .map(({ iban, ...a }) => ({ ...a, iban: mask(iban), status: a.status === 'active' && a.valid_until && a.valid_until < now() ? 'expired' : a.status }));
  return { configured: bank.configured(), banks: BANKS.map((b) => b.name), accounts, running: isRunning() };
}

/**
 * Moves an account's bank lines to another ledger name. Links to CSV lines under the old name are dropped,
 * and moved lines that a CSV already holds under the new name are merged into those (the CSV keeps its category).
 */
function rename(uid, label) {
  const l = String(label || '').trim();
  if (!l || l.length > 40) throw new bank.BankError(400, 'Name 1 bis 40 Zeichen');
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
