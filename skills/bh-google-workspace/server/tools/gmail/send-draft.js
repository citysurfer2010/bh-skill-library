'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'gmail.sendDraft', description: 'Sends an existing email draft.', inputSchema: { type: 'object', properties: { draftId: { type: 'string' } }, required: ['draftId'] },
  handler: async ({ draftId }) => {
  const r = await gapiJSON('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send', { id: draftId });
  if (r.status !== 200) return apiErr('gmail.sendDraft', r.status, r.data);
  return ok(`Entwurf ${draftId} gesendet. Nachrichten-ID: ${r.data.id}`);},
};
