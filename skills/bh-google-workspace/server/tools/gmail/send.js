'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { encodeEmail } = require('../../lib/gmail-helpers.js');

module.exports = { name: 'gmail.send', description: 'Sendet eine E-Mail. Setze html:true, damit der Body als text/html gerendert wird (sonst als Plaintext).', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, replyTo: { type: 'string' }, threadId: { type: 'string' }, html: { type: 'boolean', description: 'Wenn true, wird Content-Type auf text/html gesetzt; sonst text/plain.' } }, required: ['to', 'subject', 'body'] },
  handler: async ({ to, subject, body, cc, bcc, replyTo, threadId, html }) => {
  const contentType = html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  const hdrs = { To: to, Subject: subject, 'Content-Type': contentType, 'MIME-Version': '1.0' };
  if (cc) hdrs.Cc = cc;
  if (bcc) hdrs.Bcc = bcc;
  if (replyTo) hdrs['Reply-To'] = replyTo;
  const raw = encodeEmail(hdrs, body);
  const payload = { raw };
  if (threadId) payload.threadId = threadId;
  const r = await gapiJSON('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', payload);
  if (r.status !== 200) return apiErr('gmail.send', r.status, r.data);
  return ok(`E-Mail gesendet. ID: ${r.data.id}, Thread: ${r.data.threadId}`);},
};
