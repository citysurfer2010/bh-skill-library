'use strict';
const { get, text } = require('../../lib/api');

module.exports = {
  name: 'get_housing',
  description: 'Wohnkosten der Mietwohnung je Jahr: Miete (inkl. Nebenkosten-Vorauszahlung), Nebenkostenabrechnung (Nachzahlung negativ, Erstattung positiv), Strom/Energie, Rundfunk, Summe und je Monat; Einrichtung separat. Dazu die Schätzung für das laufende Jahr und alle Abrechnungen. Beträge in Euro.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => text(await get('/housing')),
};
