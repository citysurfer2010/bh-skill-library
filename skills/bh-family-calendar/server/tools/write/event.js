'use strict';
const { createEvent } = require('../../lib/create.js');
module.exports = { name: 'event', description: 'Legt einen einmaligen Termin im Family-Kalender an und lädt Gäste per E-Mail ein. Vor dem Anlegen mit Gästen beim User rückfragen; dryRun zeigt den Termin, ohne etwas zu senden.',
  inputSchema: { type: 'object', required: ['summary'], properties: {
    summary: { type: 'string', description: 'Titel' },
    date: { type: 'string', description: 'Ganztägig: Tag als JJJJ-MM-TT' },
    endDate: { type: 'string', description: 'Ganztägig: letzter Tag, falls mehrtägig' },
    start: { type: 'string', description: 'Beginn als JJJJ-MM-TTThh:mm, Berliner Zeit' },
    end: { type: 'string', description: 'Ende als JJJJ-MM-TTThh:mm; ohne Angabe eine Stunde' },
    location: { type: 'string', description: 'Ort' },
    description: { type: 'string', description: 'Beschreibung' },
    attendees: { type: 'array', items: { type: 'string' }, description: 'E-Mail-Adressen der Gäste' },
    dryRun: { type: 'boolean', description: 'Nur prüfen und anzeigen, nichts anlegen und nichts senden' },
  } },
  handler: async (args) => { try { return { content: [{ type: 'text', text: JSON.stringify(await createEvent(args)) }] }; } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; } } };
