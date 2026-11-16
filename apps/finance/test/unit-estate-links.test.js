'use strict';
/** Drive folders of the flats: matched by street and a common flat number; links survive a new sheet import and reach the loans. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-links-'));
const loans = require('../lib/loans');
const links = require('../lib/estate-links');
const sheet = { units: [
  { address: '10000, Musterstadt, Musterweg 1', unit: 'WE 02', loans: [{ position: 1, amount: 100, balance: 90, lender: 'Bank A' }] },
  { address: '10000, Musterstadt, Lindenallee 20, WE 30', unit: 'WE 30', loans: [] },
  { address: '10000, Musterstadt, Lindenallee 20, WE 31', unit: 'WE 31', loans: [] },
  { address: '20000, Beispielort, Am Park 3a, SP 16', unit: 'WE 27, SP 16', loans: [] },
  { address: '20000, Beispielort, Am Park 3a, WE 27a', unit: 'WE 27a', loans: [] },
  { address: '30000, Nirgendwo, Ohneweg 9', unit: 'WE 01', loans: [] },
] };
const folders = [
  { name: '10000, Musterstadt, Musterweg 1, EG links, WE 02', id: 'folderMusterweg01', financeId: 'financeMusterweg01' },
  { name: '10000, Musterstadt, Lindenallee 20, VH 5. OG, WE 30, WE 31', id: 'folderLinden3031', financeId: null },
  { name: '20000, Beispielort, Am Park 3A, WE 27', id: 'folderAmPark0027' },
  { name: '#_Vorlage', id: 'folderVorlage000' },
];

test('match: street + common flat number, one folder for two flats, 27a and SP 16 belong to WE 27', () => {
  loans.importSheet(sheet);
  const r = links.importLinks({ folders });
  assert.deepEqual(r, { linked: 5, units: 6, missing: ['30000, Nirgendwo, Ohneweg 9 – WE 01'] });
  assert.equal(links.of('10000, Musterstadt, Lindenallee 20, WE 31 – WE 31').folder_url, 'https://drive.google.com/drive/folders/folderLinden3031');
  assert.equal(links.of('20000, Beispielort, Am Park 3a, SP 16 – WE 27, SP 16').folder_url, 'https://drive.google.com/drive/folders/folderAmPark0027');
});

test('links survive a new sheet import; loans use the financing folder, the module shows the flat folder', () => {
  loans.importSheet(sheet);
  assert.equal(loans.overview().loans[0].docs_url, 'https://drive.google.com/drive/folders/financeMusterweg01');
  const u = loans.estate().units.find((x) => x.unit === 'WE 02');
  assert.equal(u.folder_url, 'https://drive.google.com/drive/folders/folderMusterweg01');
  assert.equal(links.match([{ name: '10000, Musterstadt, Musterweg 1, WE 02', id: 'bad id!' }], [{ unit_key: 'k', address: '10000, Musterstadt, Musterweg 1', unit: 'WE 02' }])[0].folder_url, null, 'odd ids give no link');
});

test('a statement header like "Lindenallee20 WE30,31" names both flats', () => {
  assert.deepEqual(links.unitsFor('Musterstadt,Lindenallee 20 WE30,31').sort(), ['10000, Musterstadt, Lindenallee 20, WE 30 – WE 30', '10000, Musterstadt, Lindenallee 20, WE 31 – WE 31']);
  assert.deepEqual(links.unitsFor('Musterstadt, Lindenallee 20, WE 31'), ['10000, Musterstadt, Lindenallee 20, WE 31 – WE 31']);
});

