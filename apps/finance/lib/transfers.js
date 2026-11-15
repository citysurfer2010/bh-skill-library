'use strict';
/**
 * Money between own accounts is a transfer (TRANS), never income or spending (Matti 15.11.2026: what matters is
 * money coming in from outside and going out). Two signals, in this order:
 *  1. the other side is one of our own IBANs (bank field or IBAN in the text);
 *  2. for history without IBANs: the same amount with opposite sign on two own accounts within 3 days, only when
 *     the pair is unique and one side names an account holder (transfers between own accounts carry our name).
 * Only lines nobody decided yet are changed: open lines and lines booked by a learned rule. Manual and spreadsheet
 * categories stay as they are, and a person's later correction (manual) is never overwritten.
 */
const { getDb } = require('./db');

const IBAN = /\bDE\d{2}(?:\s?[0-9A-Z]{4}){4}\s?[0-9A-Z]{2}\b/g;
const norm = (s) => String(s || '').replace(/\s/g, '').toUpperCase();
const FREE = "(category IS NULL OR category_source = 'rule')";
const WINDOW_DAYS = 3;

function holderWords(db) {
  const words = new Set();
  for (const r of db.prepare("SELECT name FROM bank_accounts WHERE name != ''").all()) {
    for (const w of r.name.split(/[\s,]+/)) if (w.length >= 4 && !/^(und|oder)$/i.test(w)) words.add(w.toLowerCase());
  }
  return [...words];
}

function detect() {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM categories WHERE code = 'TRANS'").get()) return { byIban: 0, byPair: 0 };
  const own = new Map(db.prepare("SELECT label, iban FROM bank_accounts WHERE iban != ''").all().map((r) => [norm(r.iban), r.label]));
  const mark = db.prepare("UPDATE transactions SET category = 'TRANS', category_source = 'transfer', suggestion = NULL WHERE id = ?");
  let byIban = 0; let byPair = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (own.size) {
      for (const r of db.prepare(`SELECT id, account, text, counterparty_iban FROM transactions WHERE ${FREE} AND (counterparty_iban IS NOT NULL OR text LIKE '%DE%')`).all()) {
        const ibans = [r.counterparty_iban, ...(String(r.text).match(IBAN) || [])].filter(Boolean).map(norm);
        if (ibans.some((i) => own.has(i) && own.get(i) !== r.account)) byIban += mark.run(r.id).changes;
      }
    }
    const words = holderWords(db);
    if (words.length) {
      const named = (r) => words.some((w) => `${r.text} ${r.counterparty}`.toLowerCase().includes(w));
      const candidates = db.prepare(`SELECT id, account, booked_on, amount_cents, text, counterparty FROM transactions WHERE ${FREE} AND amount_cents < 0`).all();
      const partners = db.prepare(`SELECT id, account, text, counterparty FROM transactions WHERE ${FREE} AND amount_cents = ? AND account != ? AND booked_on BETWEEN date(?, '-${WINDOW_DAYS} day') AND date(?, '+${WINDOW_DAYS} day')`);
      const used = new Set();
      for (const a of candidates) {
        if (used.has(a.id)) continue;
        const list = partners.all(-a.amount_cents, a.account, a.booked_on, a.booked_on).filter((p) => !used.has(p.id));
        if (list.length !== 1 || !(named(a) || named(list[0]))) continue;
        used.add(a.id); used.add(list[0].id);
        byPair += mark.run(a.id).changes + mark.run(list[0].id).changes;
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { byIban, byPair };
}

module.exports = { detect, holderWords };
