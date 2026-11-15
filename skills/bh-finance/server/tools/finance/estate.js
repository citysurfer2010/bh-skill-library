'use strict';
const { get, text } = require('../../lib/api');

module.exports = {
  name: 'finance_get_estate',
  description: 'Wohnungen (Immobilien): Adresse, Lage, Eigentümer, Fläche, Marktwert, Kaltmiete im Jahr, Restschuld der Darlehen, Link zum Drive-Ordner. Mit Summen. Beträge in Euro.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => text(await get('/estate')),
};
