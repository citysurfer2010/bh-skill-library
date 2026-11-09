/** Reading iCloud Mail. BODY.PEEK keeps messages unread. */
'use strict';

const { withMailbox, arg } = require('./imap.js');
const { parseMessage, parseHeaders, decodeWords } = require('./mime.js');
const { ZONE } = require('./ical.js');

const BODY_BYTES = 2 * 1024 * 1024;
const TEXT_LIMIT = 64 * 1024;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function imapDate(value, label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`${label}: bitte als JJJJ-MM-TT angeben`);
  return `${Number(m[3])}-${MONTHS[Number(m[2]) - 1]}-${m[1]}`;
}

function localDate(value) {
  const t = Date.parse(value || '');
  return Number.isNaN(t) ? value : new Date(t).toLocaleString('sv-SE', { timeZone: ZONE }).replace(' ', 'T');
}

function listFolders() {
  return withMailbox(null, async (session) => {
    const list = await session.run('LIST "" "*"');
    return list.flatMap(({ text, literals }) => {
      const m = /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.*)$/i.exec(text);
      if (!m || /\\Noselect/i.test(m[1])) return [];
      return [literals[0] ? literals[0].toString('utf8') : m[2].replace(/^"|"$/g, '').replace(/\\(["\\])/g, '$1')];
    });
  });
}

function criteria({ query, from, subject, since, before, unread }) {
  const pieces = [];
  const add = (key, value) => { if (value) pieces.push(` ${key} `, arg(value)); };
  if (since) pieces.push(` SINCE ${imapDate(since, 'since')}`);
  if (before) pieces.push(` BEFORE ${imapDate(before, 'before')}`);
  if (unread) pieces.push(' UNSEEN');
  add('FROM', from); add('SUBJECT', subject); add('TEXT', query);
  return pieces.length ? pieces : [' ALL'];
}

function summary({ text, literals }) {
  const uid = /\bUID (\d+)/.exec(text);
  if (!uid || !literals[0]) return null;
  const headers = parseHeaders(literals[0].toString('latin1'));
  return {
    uid: Number(uid[1]),
    from: decodeWords(headers.from), to: decodeWords(headers.to), subject: decodeWords(headers.subject),
    date: localDate(headers.date),
    unread: !/\\Seen/i.test(/FLAGS \(([^)]*)\)/.exec(text)?.[1] || ''),
    size: Number(/RFC822\.SIZE (\d+)/.exec(text)?.[1] || 0),
  };
}

function searchMail({ folder, limit, ...filter }) {
  const pieces = criteria(filter);
  const charset = pieces.some(Buffer.isBuffer) ? ' CHARSET UTF-8' : '';
  return withMailbox(folder, async (session) => {
    const found = await session.run(`UID SEARCH${charset}`, ...pieces);
    const uids = found.flatMap((r) => (/^\* SEARCH\b/i.test(r.text) ? r.text.replace(/^\* SEARCH\s*/i, '').split(/\s+/).filter(Boolean).map(Number) : []));
    const newest = uids.sort((a, b) => b - a).slice(0, limit);
    if (!newest.length) return { folder, total: 0, truncated: false, messages: [] };
    const rows = await session.run(`UID FETCH ${newest.join(',')} (UID FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])`);
    const messages = rows.map(summary).filter(Boolean).sort((a, b) => b.uid - a.uid);
    return { folder, total: uids.length, truncated: uids.length > limit, messages };
  });
}

function readMail({ folder, uid }) {
  const id = Number(uid);
  if (!Number.isInteger(id) || id < 1) throw new Error('uid: bitte die Nummer aus mail_search angeben');
  return withMailbox(folder, async (session) => {
    const rows = await session.run(`UID FETCH ${id} (UID BODY.PEEK[]<0.${BODY_BYTES}>)`);
    const row = rows.find((r) => r.literals[0]);
    if (!row) throw new Error(`Nachricht ${id} nicht gefunden in ${folder}`);
    const { headers, text, attachments } = parseMessage(row.literals[0]);
    return {
      uid: id, folder,
      from: decodeWords(headers.from), to: decodeWords(headers.to), cc: decodeWords(headers.cc) || undefined, subject: decodeWords(headers.subject),
      date: localDate(headers.date),
      text: text.slice(0, TEXT_LIMIT),
      truncated: text.length > TEXT_LIMIT || row.literals[0].length >= BODY_BYTES,
      attachments,
    };
  });
}

module.exports = { listFolders, searchMail, readMail };
