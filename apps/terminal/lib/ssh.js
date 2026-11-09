'use strict';
/** SSH in den eigenen Container: Schlüssel des Dienstes, Hostschlüssel wird immer geprüft. */
const fs = require('fs');
const { hostKey } = require('./workspace');

async function realConnect(name) {
  const { Client } = require('ssh2');
  const expected = hostKey(name);
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => resolve(c)).on('error', reject).connect({
      host: `devbox-${name}`, port: 2222, username: 'dev', readyTimeout: 15_000, keepaliveInterval: 30_000,
      privateKey: fs.readFileSync(process.env.BH_TERMINAL_KEY),
      hostVerifier: (key) => Buffer.compare(key, expected) === 0,
    });
  });
}

let connector = realConnect;
const setConnector = (fn) => { connector = fn || realConnect; };
const connect = (name) => connector(name);

const sftpOf = (conn) => new Promise((ok, no) => conn.sftp((e, s) => (e ? no(e) : ok(s))));
async function withSftp(name, work) {
  const conn = await connect(name);
  try { return await work(await sftpOf(conn), conn); } finally { conn.end(); }
}

module.exports = { connect, withSftp, sftpOf, setConnector };
