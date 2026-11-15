#!/usr/bin/env node
'use strict';
/**
 * Links each flat to its Drive folder. Reads JSON from stdin: { folders: [{ name, id, financeId }] } (the property folders and
 * their "02_Finanzierung" subfolder). Only folder ids are stored, never file contents.
 *   node scripts/import-estate-links.js < folders.json
 */
const { closeDb } = require('../lib/db');
const links = require('../lib/estate-links');

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  const r = links.importLinks(JSON.parse(input));
  console.log(`Ordner verlinkt: ${r.linked} von ${r.units} Wohnungen${r.missing.length ? `; ohne Ordner: ${r.missing.length}` : ''}`);
  closeDb();
});
