'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'gmail.modify', description: 'Ändert Labels einer Gmail-Nachricht (z.B. als gelesen markieren).', inputSchema: { type: 'object', properties: { messageId: { type: 'string' }, addLabelIds: { type: 'array', items: { type: 'string' } }, removeLabelIds: { type: 'array', items: { type: 'string' } } }, required: ['messageId'] },
  handler: async ({ messageId, addLabelIds = [], removeLabelIds = [] }) => {
  const r = await gapiJSON('POST', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, { addLabelIds, removeLabelIds });
  if (r.status !== 200) return apiErr('gmail.modify', r.status, r.data);
  return ok(`Nachricht ${messageId} Labels aktualisiert.`);},
};
