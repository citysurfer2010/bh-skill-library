'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'gmail.search', description: 'Durchsucht Google Mail nach Nachrichten.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Gmail-Suchquery, z.B. "in:inbox from:example@gmail.com"' }, maxResults: { type: 'number', description: 'Max. Ergebnisse (default: 10)' } }, required: ['query'] },
  handler: async ({ query, maxResults = 10 }) => {
  const r = await gapiJSON('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
  if (r.status !== 200) return apiErr('gmail.search', r.status, r.data);
  const msgs = r.data.messages || [];
  if (!msgs.length) return ok('Keine Nachrichten gefunden.');
  const details = await Promise.all(msgs.slice(0, Math.min(msgs.length, 5)).map(async m => {
    const mr = await gapiJSON('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    if (mr.status !== 200) return `ID: ${m.id}`;
    const hdrs = {};
    for (const h of (mr.data.payload?.headers || [])) hdrs[h.name.toLowerCase()] = h.value;
    return `ID: ${m.id} | Von: ${hdrs.from || '?'} | Betreff: ${hdrs.subject || '?'} | ${hdrs.date || '?'} `;
  }));
  const more = msgs.length > 5 ? `\n... und ${msgs.length - 5} weitere` : '';
  return ok(`${msgs.length} Nachricht(en) gefunden:\n\n${details.join('\n')}${more}`);},
};
