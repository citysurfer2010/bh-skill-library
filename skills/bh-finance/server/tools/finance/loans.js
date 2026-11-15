'use strict';
const { get, text } = require('../../lib/api');

module.exports = {
  name: 'finance_get_loans',
  description: 'Kredite der Wohnungen: Darlehensgeber, Restschuld heute (laut Bank: letzter Kontoauszug minus Tilgung seitdem, sonst laut Portfolioübersicht), Rate je Monat, Zinssatz, Laufzeit, Zins und Tilgung je Jahr, Restschuld zum Jahresende. Darlehenskonten nur gekürzt. Beträge in Euro.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => text(await get('/loans')),
};
