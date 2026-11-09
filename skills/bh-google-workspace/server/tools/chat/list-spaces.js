'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.listSpaces', description: 'Lists all Google Chat spaces.', inputSchema: { type: 'object', properties: { pageSize: { type: 'number' } } },
  handler: async ({ pageSize = 20 }) => {
  const r = await gapiJSON('GET', `https://chat.googleapis.com/v1/spaces?pageSize=${pageSize}`);
  if (r.status !== 200) return apiErr('chat.listSpaces', r.status, r.data);
  const spaces = (r.data.spaces || []).map(s => `${s.displayName || s.name} (${s.name})`).join('\n');
  return ok(spaces || 'Keine Spaces gefunden.');},
};
