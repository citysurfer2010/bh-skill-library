'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.setUpSpace', description: 'Creates a new Google Chat space.', inputSchema: { type: 'object', properties: { displayName: { type: 'string' }, members: { type: 'array', items: { type: 'string' }, description: 'Email addresses of the members' } }, required: ['displayName'] },
  handler: async ({ displayName, members = [] }) => {
  const r = await gapiJSON('POST', 'https://www.googleapis.com/chat/v1/spaces:setup', {
    space: { spaceType: 'SPACE', displayName },
    memberships: members.map(email => ({ member: { name: `users/${email}`, type: 'HUMAN' } }))
  });
  if (r.status !== 200 && r.status !== 201) return apiErr('chat.setUpSpace', r.status, r.data);
  return ok(`Space erstellt: ${r.data.displayName} (${r.data.name})`);},
};
