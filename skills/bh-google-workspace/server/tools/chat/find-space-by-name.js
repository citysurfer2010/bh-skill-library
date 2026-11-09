'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.findSpaceByName', description: 'Finds a Google Chat space by name.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  handler: async ({ name }) => {
  const r = await gapiJSON('GET', 'https://chat.googleapis.com/v1/spaces?pageSize=100');
  if (r.status !== 200) return apiErr('chat.findSpaceByName', r.status, r.data);
  const spaces = (r.data.spaces || []).filter(s => (s.displayName || '').toLowerCase().includes(name.toLowerCase()));
  if (!spaces.length) return ok(`Kein Space mit "${name}" gefunden.`);
  return ok(spaces.map(s => `${s.displayName} (${s.name})`).join('\n'));},
};
