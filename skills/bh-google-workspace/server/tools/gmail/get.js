'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { formatMessage } = require('../../lib/gmail-helpers.js');

module.exports = { name: 'gmail.get', description: 'Reads a Gmail message by ID.', inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, format: { type: 'string', description: 'full|metadata|minimal (default: full)' } }, required: ['messageId'] },
  handler: async ({ messageId, format = 'full' }) => {
  const r = await gapiJSON('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=${format}`);
  if (r.status !== 200) return apiErr('gmail.get', r.status, r.data);
  return ok(formatMessage(r.data));},
};
