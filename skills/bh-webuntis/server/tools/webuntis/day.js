'use strict';
const { day } = require('../../lib/webuntis.js');
module.exports = { name: 'day', description: 'Timetable of the children for one day, with cancellations and substitutions. Without a date, the next relevant school day.',
  inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } } },
  handler: async ({ date } = {}) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await day(date)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; }
  } };
