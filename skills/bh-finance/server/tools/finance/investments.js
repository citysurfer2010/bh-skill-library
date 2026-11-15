'use strict';
const { get, text } = require('../../lib/api');

module.exports = {
  name: 'finance_get_investments',
  description: 'Investments und Rücklagen eines Jahres: Summe, je Monat, wohin das Geld ging (z. B. ETF-Sparplan, Rücklagen der Kinder) und über die Jahre kumuliert. Beträge in Euro.',
  inputSchema: { type: 'object', properties: { year: { type: 'number', description: 'Jahr (Standard: laufendes Jahr)' } } },
  handler: async ({ year }) => text(await get('/investments', { year })),
};
