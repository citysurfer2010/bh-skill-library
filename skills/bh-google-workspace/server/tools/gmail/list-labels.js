'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'gmail.listLabels', description: 'Lists all Gmail labels.', inputSchema: { type: 'object', properties: {} },
  handler: async () => {
  const r = await gapiJSON('GET', 'https://gmail.googleapis.com/gmail/v1/users/me/labels');
  if (r.status !== 200) return apiErr('gmail.listLabels', r.status, r.data);
  const labels = (r.data.labels || []).map(l => `${l.name} (${l.id})`).join('\n');
  return ok(labels || 'Keine Labels.');},
};
