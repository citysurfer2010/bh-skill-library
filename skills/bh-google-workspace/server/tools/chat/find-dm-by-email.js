'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.findDmByEmail', description: 'Findet einen Direct-Message Chat nach E-Mail-Adresse.', inputSchema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
  handler: async ({ email }) => {
  const r = await gapiJSON('GET', `https://chat.googleapis.com/v1/spaces?pageSize=100`);
  if (r.status !== 200) return apiErr('chat.findDmByEmail', r.status, r.data);
  const dms = (r.data.spaces || []).filter(s => s.spaceType === 'DIRECT_MESSAGE');
  // Return all DM spaces (we can't easily filter by email without additional lookup)
  if (!dms.length) return ok('Keine DM-Spaces gefunden.');
  return ok(`DM-Spaces:\n${dms.map(s => s.name).join('\n')}\n\nHinweis: Für E-Mail-Suche Details-API nutzen.`);},
};
