'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'icloud-imap-'));
const d = path.join(process.env.HOME, '.config/bh-icloud'); fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(d, '.env'), 'BH_ICLOUD_APPLE_ID=a@example.org\nBH_ICLOUD_PASSWORD=abcd-efgh-ijkl-mnop\nBH_ICLOUD_MAIL_USER=a@icloud.com\n');

const imap = require('../lib/imap.js');
const tools = require('../tools/index.js');
const text = (r) => r.content[0].text;
const run = async (name, args) => { const out = text(await tools.TOOLS[name].handler(args)); if (out.startsWith('Fehler')) throw new Error(out); return JSON.parse(out); };

test.beforeEach(() => { fs.rmSync(path.join(d, '.rejected-mail'), { force: true }); imap.closeShared(); });
test.afterEach(() => imap.closeShared());

// A real socket server that speaks just enough IMAP, including synchronizing literals.
async function fakeServer(respond) {
  const seen = [];
  const server = net.createServer((sock) => {
    let buf = ''; let command = ''; let need = 0;
    sock.on('error', () => {});
    sock.write('* OK ready\r\n');
    sock.on('data', (c) => {
      buf += c.toString('latin1');
      for (;;) {
        if (need) { if (buf.length < need) return; command += buf.slice(0, need); buf = buf.slice(need); need = 0; }
        const eol = buf.indexOf('\r\n');
        if (eol < 0) return;
        const line = buf.slice(0, eol); buf = buf.slice(eol + 2);
        const lit = /\{(\d+)\}$/.exec(line);
        if (lit) { command += line.slice(0, lit.index); need = Number(lit[1]); sock.write('+ go\r\n'); continue; }
        const full = command + line; command = '';
        seen.push(full);
        const [tag, ...rest] = full.split(' ');
        const cmd = rest.join(' ');
        if (tag === 'Z') { sock.end('* BYE\r\n'); return; }
        const reply = /^LOGIN/.test(cmd) ? `${tag} OK\r\n` : /^EXAMINE/.test(cmd) ? `${tag} OK [READ-ONLY]\r\n` : respond(cmd, tag);
        sock.write(reply);
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  imap.setConnector(() => { const s = net.connect(server.address().port, '127.0.0.1'); return s; });
  return { seen, stop: () => new Promise((r) => { imap.closeShared(); server.close(r); }) };
}

const header = 'From: =?UTF-8?B?QW5uYSBNw7xsbGVy?= <anna@example.org>\r\nSubject: Hallo\r\nDate: Mon, 09 Nov 2026 10:00:00 +0000\r\n\r\n';

test('search: newest first, headers only, opened read-only and unread stays unread', async () => {
  const s = await fakeServer((cmd, tag) => (/^UID SEARCH/.test(cmd)
    ? `* SEARCH 3 7 9\r\n${tag} OK\r\n`
    : `* 2 FETCH (UID 7 FLAGS (\\Seen) RFC822.SIZE 50 BODY[HEADER.FIELDS (FROM)] {${header.length}}\r\n${header})\r\n* 3 FETCH (UID 9 FLAGS () RFC822.SIZE 60 BODY[HEADER.FIELDS (FROM)] {${header.length}}\r\n${header})\r\n${tag} OK\r\n`));
  try {
    const r = await run('mail_search', { limit: 2, since: '2026-11-01', from: 'anna' });
    assert.deepEqual(r.messages.map((m) => [m.uid, m.unread]), [[9, true], [7, false]]);
    assert.equal(r.total, 3); assert.equal(r.truncated, true);
    assert.equal(r.messages[0].from, 'Anna Müller <anna@example.org>'); assert.equal(r.messages[0].date, '2026-11-09T11:00:00');
    assert.match(s.seen.join('\n'), /EXAMINE "INBOX"/); assert.doesNotMatch(s.seen.join('\n'), /\bSELECT\b|STORE|EXPUNGE|\bDELETE\b/);
    assert.match(s.seen.find((c) => c.includes('UID SEARCH')), /SINCE 1-Nov-2026 FROM "anna"/);
    assert.match(s.seen.find((c) => c.includes('UID FETCH')), /UID FETCH 9,7 .*BODY\.PEEK/);
  } finally { await s.stop(); }
});

test('search: umlauts go out as literal with charset, injection is refused', async () => {
  const s = await fakeServer((_cmd, tag) => `* SEARCH\r\n${tag} OK\r\n`);
  try {
    const r = await run('mail_search', { subject: 'Grüße' });
    assert.equal(r.total, 0);
    assert.match(s.seen.find((c) => c.includes('UID SEARCH')), /CHARSET UTF-8 SUBJECT Gr/);
    assert.equal((await tools.TOOLS.mail_search.handler({ query: 'x"\r\nA9 DELETE INBOX' })).isError, true);
    assert.doesNotMatch(s.seen.join('\n'), /DELETE/);
    await run('mail_search', { query: 'a"b\\c' });
    assert.match(s.seen.at(-1), /TEXT "a\\"b\\\\c"/);
  } finally { await s.stop(); }
});

test('read: body via PEEK as text with attachment names', async () => {
  const msg = 'From: a@b\r\nSubject: =?ISO-8859-1?Q?Gr=FC=DFe?=\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHallo Welt\r\n';
  const s = await fakeServer((_cmd, tag) => `* 1 FETCH (UID 5 BODY[]<0> {${msg.length}}\r\n${msg})\r\n${tag} OK\r\n`);
  try {
    const r = await run('mail_read', { uid: 5 });
    assert.equal(r.text, 'Hallo Welt'); assert.equal(r.subject, 'Grüße'); assert.equal(r.truncated, false);
    assert.match(s.seen.find((c) => c.includes('UID FETCH')), /BODY\.PEEK\[\]<0\.2097152>/);
    assert.equal((await tools.TOOLS.mail_read.handler({ uid: '5 (BODY[])' })).isError, true);
  } finally { await s.stop(); }
});

test('read: unknown uid is a clear error', async () => {
  const s = await fakeServer((_cmd, tag) => `${tag} OK\r\n`);
  try { assert.match(text(await tools.TOOLS.mail_read.handler({ uid: 99 })), /nicht gefunden/); } finally { await s.stop(); }
});

test('folders: quoted, plain and literal names; containers without mail are left out', async () => {
  const s = await fakeServer((_cmd, tag) => `* LIST (\\HasNoChildren) "/" "Sent Messages"\r\n* LIST () "/" INBOX\r\n* LIST (\\Noselect) "/" "Archiv"\r\n* LIST () "/" {5}\r\nNotiz\r\n${tag} OK\r\n`);
  try { assert.deepEqual(await run('mail_folders', {}), ['Sent Messages', 'INBOX', 'Notiz']); } finally { await s.stop(); }
});

test('rejected login mentions the mail address, password never appears', async () => {
  const server = net.createServer((sock) => {
    sock.on('error', () => {});
    sock.write('* OK\r\n');
    sock.on('data', (c) => { const [tag] = c.toString().split(' '); if (tag === 'Z') sock.end(); else sock.write(`${tag} NO auth\r\n`); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  imap.setConnector(() => net.connect(server.address().port, '127.0.0.1'));
  try {
    const out = text(await tools.TOOLS.mail_folders.handler({}));
    assert.match(out, /iCloud-Mail-Adresse/); assert.doesNotMatch(out, /abcd-efgh/);
    assert.match(text(await tools.TOOLS.mail_folders.handler({})), /gesperrt/);
  } finally { imap.closeShared(); await new Promise((r) => { server.close(r); }); }
});

test('connection that drops mid-command fails cleanly', async () => {
  const server = net.createServer((sock) => { sock.on('error', () => {}); sock.write('* OK\r\n'); sock.once('data', () => sock.destroy()); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  imap.setConnector(() => net.connect(server.address().port, '127.0.0.1'));
  try { assert.match(text(await tools.TOOLS.mail_folders.handler({})), /getrennt/); } finally { await new Promise((r) => { server.close(r); }); }
});

test('a second tool call reuses the login, concurrent calls do not interleave', async () => {
  const s = await fakeServer((_cmd, tag) => `* LIST () "/" INBOX\r\n${tag} OK\r\n`);
  try {
    await run('mail_folders', {});
    await Promise.all([run('mail_folders', {}), run('mail_folders', {})]);
    assert.equal(s.seen.filter((c) => c.includes('LOGIN')).length, 1);
    assert.equal(s.seen.filter((c) => c.includes('LIST')).length, 3);
  } finally { await s.stop(); }
});
