'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.getMessages', description: 'Reads messages from a Google Chat space.', inputSchema: { type: 'object', properties: { spaceName: { type: 'string', description: 'Space name, e.g. "spaces/XXXX"' }, pageSize: { type: 'number' } }, required: ['spaceName'] },
  handler: async ({ spaceName, pageSize = 20 }) => {
  const r = await gapiJSON('GET', `https://chat.googleapis.com/v1/${spaceName}/messages?pageSize=${pageSize}&orderBy=createTime desc`);
  if (r.status !== 200) return apiErr('chat.getMessages', r.status, r.data);
  const msgs = (r.data.messages || []).map(m => `[${m.createTime}] ${m.sender?.displayName || '?'}: ${m.text || m.fallbackText || ''}`).join('\n');
  return ok(msgs || 'Keine Nachrichten.');},
};
