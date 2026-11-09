'use strict';
/**
 * Wem gehört welche Arbeitsumgebung. Die Daten schreibt der Abgleich auf dem Server; die App liest sie nur.
 *   map.json            { "email": "name" }
 *   status/<name>.json  { "state": "preparing" | "ready" | "failed" }
 *   hostkeys/<name>.pub öffentlicher Schlüssel des Containers
 */
const fs = require('fs');
const path = require('path');

const dir = () => process.env.BH_TERMINAL_STATE || path.join(process.env.DATA_DIR || 'data', 'state');
const NAME = /^[a-z][a-z0-9-]{1,30}$/;
const json = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

function nameOf(email) {
  const name = (json(path.join(dir(), 'map.json')) || {})[String(email).toLowerCase()];
  return NAME.test(String(name)) ? name : null;
}

function statusOf(email) {
  const name = nameOf(email);
  if (!name) return { state: 'preparing', name: null };
  const s = json(path.join(dir(), 'status', `${name}.json`));
  return { state: ['ready', 'failed'].includes(s?.state) ? s.state : 'preparing', name, subdomain: s?.subdomain || null };
}

function hostKey(name) {
  const line = fs.readFileSync(path.join(dir(), 'hostkeys', `${name}.pub`), 'utf8').trim();
  return Buffer.from(line.split(/\s+/)[1], 'base64');
}

module.exports = { nameOf, statusOf, hostKey };
