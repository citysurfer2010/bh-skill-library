'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMessage, listAttachments } = require('../lib/gmail-helpers.js');

const msg = { id: 'm1', snippet: 'Rechnung anbei', payload: { mimeType: 'multipart/mixed', headers: [{ name: 'Subject', value: 'Rechnung' }], parts: [
  { mimeType: 'text/plain', body: { data: Buffer.from('Hallo').toString('base64url') } },
  { mimeType: 'multipart/alternative', parts: [{ mimeType: 'application/pdf', filename: 'rechnung.pdf', body: { attachmentId: 'ATT-1', size: 1234 } }] },
  { mimeType: 'image/png', filename: '', body: { size: 10 } },
] } };

test('attachments are listed with their ids, nested parts included', () => {
  assert.deepEqual(listAttachments(msg.payload), [{ filename: 'rechnung.pdf', mimeType: 'application/pdf', size: 1234, attachmentId: 'ATT-1' }]);
  assert.match(formatMessage(msg), /Anhänge \(1\):\n- rechnung\.pdf \(application\/pdf, 1234 Bytes\) attachmentId: ATT-1/);
});

test('no attachment section without attachments', () => {
  assert.doesNotMatch(formatMessage({ id: 'm2', payload: { headers: [], mimeType: 'text/plain', body: { data: '' } } }), /Anhänge/);
});
