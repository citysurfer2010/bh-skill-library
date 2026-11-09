'use strict';
const d = require('../../lib/on-this-day.js');
const out = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
module.exports = { name: 'on_this_day', description: 'Drei schöne Ereignisse und eine bekannte Person vom heutigen Datum, aus Wikipedia. Wird höchstens einmal am Tag geholt.', inputSchema: { type: 'object', properties: {} },
  handler: async () => { try { await d.prepare(); return out(d.forToday()); } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
