'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.sendDm', description: 'Sends a Google Chat direct message to an email address.', inputSchema: { type: 'object', properties: { email: { type: 'string' }, text: { type: 'string' } }, required: ['email', 'text'] },
  handler: async ({ email, text }) => {
  // Create/find DM space, then send message
  const r = await gapiJSON('POST', 'https://chat.googleapis.com/v1/spaces:findDirectMessage?name=users/me', {});
  // Alternative: try to create DM
  const setupR = await gapiJSON('POST', 'https://chat.googleapis.com/v1/spaces:setup', {
    space: { spaceType: 'DIRECT_MESSAGE' },
    memberships: [{ member: { name: `users/${email}`, type: 'HUMAN' } }]
  });
  if (setupR.status !== 200 && setupR.status !== 201) return apiErr('chat.sendDm (setup)', setupR.status, setupR.data);
  const spaceName = setupR.data.name;
  const msgR = await gapiJSON('POST', `https://www.googleapis.com/chat/v1/${spaceName}/messages`, { text });
  if (msgR.status !== 200 && msgR.status !== 201) return apiErr('chat.sendDm (send)', msgR.status, msgR.data);
  return ok(`DM an ${email} gesendet: ${msgR.data.name}`);},
};
