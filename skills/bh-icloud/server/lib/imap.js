/** Small IMAP client for iCloud Mail. Folders are opened with EXAMINE, so a session cannot change anything. */
'use strict';

const tls = require('tls');
const { credentials, markRejected, RECONNECT } = require('./credentials.js');

const HOST = 'imap.mail.me.com';
const TIMEOUT_MS = 90_000;
const BUFFER_LIMIT = 32 * 1024 * 1024;

let connector = () => tls.connect({ host: HOST, port: 993, servername: HOST });
const setConnector = (fn) => { connector = fn; };

// A safe IMAP string: quoted when plain ASCII, otherwise a Buffer that run() sends as a literal.
function arg(value) {
  const s = String(value);
  if (/[\r\n\0]/.test(s)) throw new Error('Ungueltige Zeichen in der Eingabe');
  if (/^[\x20-\x7e]*$/.test(s)) return `"${s.replace(/(["\\])/g, '\\$1')}"`;
  return Buffer.from(s, 'utf8');
}

class ImapSession {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.current = { text: '', literals: [] };
    this.waiter = null;
    this.continuation = null;
    this.tagNumber = 0;
    this.alive = true;
    this.greeting = new Promise((resolve, reject) => { this.greeted = { resolve, reject }; });
    this.greeting.catch(() => {});
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (e) => this.fail(e));
    socket.on('close', () => this.fail(new Error('Verbindung zu iCloud Mail getrennt')));
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('iCloud Mail antwortet nicht')));
  }

  fail(error) {
    this.alive = false;
    this.greeted?.reject(error); this.greeted = null;
    this.continuation?.reject(error); this.continuation = null;
    this.waiter?.reject(error); this.waiter = null;
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > BUFFER_LIMIT) { this.socket.destroy(new Error('Antwort von iCloud Mail ist zu gross')); return; }
    for (;;) {
      const eol = this.buffer.indexOf('\r\n');
      if (eol < 0) return;
      const line = this.buffer.toString('latin1', 0, eol);
      const literal = /\{(\d+)\}$/.exec(line);
      if (literal) {
        const size = Number(literal[1]);
        if (this.buffer.length < eol + 2 + size) return; // Wait for the rest of the literal.
        this.current.text += line;
        this.current.literals.push(this.buffer.subarray(eol + 2, eol + 2 + size));
        this.buffer = this.buffer.subarray(eol + 2 + size);
        continue;
      }
      this.current.text += line;
      this.buffer = this.buffer.subarray(eol + 2);
      const response = this.current;
      this.current = { text: '', literals: [] };
      this.handle(response);
    }
  }

  handle(response) {
    const { text } = response;
    if (this.greeted) {
      if (/^\* (OK|PREAUTH)/i.test(text)) this.greeted.resolve(); else this.greeted.reject(new Error('iCloud Mail ist nicht bereit'));
      this.greeted = null;
      return;
    }
    if (text.startsWith('+')) { this.continuation?.resolve(); this.continuation = null; return; }
    if (this.waiter && text.startsWith(`${this.waiter.tag} `)) {
      const { resolve, reject, untagged } = this.waiter;
      this.waiter = null;
      if (/^\S+ OK/i.test(text)) resolve(untagged);
      else reject(Object.assign(new Error('iCloud Mail lehnt den Befehl ab'), { rejected: true }));
      return;
    }
    this.waiter?.untagged.push(response);
  }

  // Each piece is command text or a Buffer, which goes out as a synchronizing literal.
  async run(...pieces) {
    const tag = `A${++this.tagNumber}`;
    const done = new Promise((resolve, reject) => { this.waiter = { tag, untagged: [], resolve, reject }; });
    let line = `${tag} `;
    for (const piece of pieces) {
      if (!Buffer.isBuffer(piece)) { line += piece; continue; }
      const proceed = new Promise((resolve, reject) => { this.continuation = { resolve, reject }; });
      this.socket.write(`${line}{${piece.length}}\r\n`);
      await Promise.race([proceed, done]);
      this.socket.write(piece);
      line = '';
    }
    this.socket.write(`${line}\r\n`);
    return done;
  }

  close() {
    this.alive = false;
    this.socket.end('Z LOGOUT\r\n');
  }
}

let shared = null;
let queue = Promise.resolve();

// Reuses the login while the connection lives; it closes itself after TIMEOUT_MS without traffic.
async function session() {
  if (shared?.alive) return shared;
  const { mailUser, password } = credentials('mail');
  const fresh = new ImapSession(connector());
  try {
    await fresh.greeting;
    await fresh.run('LOGIN ', arg(mailUser), ' ', arg(password));
  } catch (e) {
    fresh.close();
    if (!e.rejected) throw e;
    markRejected('mail');
    throw new Error(`iCloud Mail lehnt die Anmeldung ab. Ist die Apple-ID keine iCloud-Adresse, muss die iCloud-Mail-Adresse angegeben sein: ${RECONNECT}`);
  }
  shared = fresh;
  return fresh;
}

async function runOnMailbox(folder, fn) {
  const s = await session();
  if (folder !== null) {
    await s.run('EXAMINE ', arg(folder)).catch((e) => {
      if (e.rejected) throw new Error(`Ordner nicht gefunden: ${folder}`);
      throw e;
    });
  }
  return fn(s);
}

// IMAP commands of one connection must not interleave. folder === null opens no mailbox.
function withMailbox(folder, fn) {
  const job = queue.then(() => runOnMailbox(folder, fn));
  queue = job.catch(() => {});
  return job;
}

function closeShared() {
  if (shared?.alive) shared.close();
  shared = null;
}

module.exports = { withMailbox, arg, setConnector, closeShared };
