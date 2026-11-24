'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeEmailWithAttachments, decodeBase64Url } = require('../lib/gmail-helpers.js');

test('mail with attachment: multipart/mixed, body and file base64, umlaut file name encoded', () => {
  const raw = encodeEmailWithAttachments({ To: 'a@example.com', Subject: 'Bogen' }, 'Hallo', [{ filename: 'Übersicht.xlsx', mimeType: 'application/vnd.ms-excel', content: Buffer.from('DATA').toString('base64') }]);
  const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.match(mime, /Content-Type: multipart\/mixed; boundary="bh-/);
  assert.match(mime, new RegExp(Buffer.from('Hallo').toString('base64')));
  assert.match(mime, new RegExp(Buffer.from('DATA').toString('base64')));
  assert.match(mime, /filename="=\?UTF-8\?B\?/);
  assert.match(mime, /--bh-[^\r\n]+--/);
});
