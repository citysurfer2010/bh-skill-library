'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.sendMessage', description: 'Sends a message to a Google Chat space.', inputSchema: { type: 'object', properties: { spaceName: { type: 'string' }, text: { type: 'string' }, threadName: { type: 'string', description: 'Thread name for replies (optional)' } }, required: ['spaceName', 'text'] },
  handler: async ({ spaceName, text, threadName }) => {
  const body = { text };
  if (threadName) body.thread = { name: threadName };
  const url = threadName
    ? `https://chat.googleapis.com/v1/${spaceName}/messages?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`
    : `https://chat.googleapis.com/v1/${spaceName}/messages`;
  const r = await gapiJSON('POST', url, body);
  if (r.status !== 200 && r.status !== 201) return apiErr('chat.sendMessage', r.status, r.data);
  return ok(`Nachricht gesendet: ${r.data.name}`);},
};
