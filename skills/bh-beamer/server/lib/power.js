/** Ein- und Ausschalten. Meldet nur dann Erfolg, wenn der Beamer den neuen Zustand auch bestaetigt. */
'use strict';

const dgram = require('dgram');

function magicPacket(mac) {
  const hex = String(mac || '').replace(/[:-]/g, '');
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) throw new Error('MAC-Adresse des Beamers fehlt (BH_BEAMER_MAC)');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(Buffer.from(hex, 'hex'))]);
}

function sendWake(ip = process.env.BH_BEAMER_IP, mac = process.env.BH_BEAMER_MAC) {
  const packet = magicPacket(mac);
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.on('error', (e) => { s.close(); reject(e); });
    let left = 3;
    const next = () => s.send(packet, 9, ip, (e) => { if (e || --left === 0) { s.close(); return e ? reject(e) : resolve(); } return setTimeout(next, 200); });
    next();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function state(remote) {
  try { return String((await remote.status()).device?.PowerState || 'unbekannt').toLowerCase(); } catch { return 'nicht erreichbar'; }
}

async function waitFor(remote, wanted, tries, delayMs) {
  for (let i = 0; i < tries; i++) {
    await sleep(delayMs);
    if (wanted(await state(remote))) return true;
  }
  return false;
}

// Ein kurzer Klick auf KEY_POWER schaltet dieses Modell nicht aus; die Taste muss gehalten werden.
async function powerOff({ remote = require('./remote.js'), tries = 10, delayMs = 2000 } = {}) {
  if ((await state(remote)) !== 'on') return 'Der Beamer ist bereits aus.';
  await remote.hold('KEY_POWER');
  if (await waitFor(remote, (s) => s !== 'on', tries, delayMs)) return 'Der Beamer ist aus.';
  throw new Error('Der Beamer ist trotz Ausschalt-Befehl noch an');
}

async function powerOn({ remote = require('./remote.js'), wake = sendWake, tries = 15, delayMs = 2000 } = {}) {
  const before = await state(remote);
  if (before === 'on') return 'Der Beamer ist bereits an.';
  await wake();
  if (before === 'standby') await remote.press('KEY_POWER').catch(() => {});
  if (await waitFor(remote, (s) => s === 'on', tries, delayMs)) return 'Der Beamer ist an.';
  throw new Error('Der Beamer reagiert nicht aufs Einschalten; aus dem tiefen Standby ist er nur per Fernbedienung zu wecken');
}

module.exports = { magicPacket, sendWake, powerOff, powerOn };
