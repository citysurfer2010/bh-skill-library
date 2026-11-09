'use strict';
const { createEvent } = require('../../lib/create.js');
module.exports = { name: 'event', description: 'Creates a one-off event in the Family calendar and invites guests by email. Ask the user before creating an event with guests; dryRun shows the event without sending anything.',
  inputSchema: { type: 'object', required: ['summary'], properties: {
    summary: { type: 'string', description: 'Title' },
    date: { type: 'string', description: 'All-day: day as YYYY-MM-DD' },
    endDate: { type: 'string', description: 'All-day: last day, if multi-day' },
    start: { type: 'string', description: 'Start as YYYY-MM-DDThh:mm, Berlin time' },
    end: { type: 'string', description: 'End as YYYY-MM-DDThh:mm; if omitted, one hour' },
    location: { type: 'string', description: 'Location' },
    description: { type: 'string', description: 'Description' },
    attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses of the guests' },
    dryRun: { type: 'boolean', description: 'Only check and show; create nothing and send nothing' },
  } },
  handler: async (args) => { try { return { content: [{ type: 'text', text: JSON.stringify(await createEvent(args)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
