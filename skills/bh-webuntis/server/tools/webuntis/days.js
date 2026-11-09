'use strict';
const { days } = require('../../lib/webuntis.js');
module.exports = { name: 'days', description: 'Timetables and open homework of the children for the next school days, always freshly fetched.',
  inputSchema: { type: 'object', properties: { count: { type: 'number', description: 'Number of school days, default 5, at most 10' } } },
  handler: async ({ count } = {}) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await days(count)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; }
  } };
