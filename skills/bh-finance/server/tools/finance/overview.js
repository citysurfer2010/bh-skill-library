'use strict';
const { get, text } = require('../../lib/api');

module.exports = {
  name: 'finance_get_overview',
  description: 'Haushaltsfinanzen eines Jahres (nur Privatkonten): Einnahmen, Ausgaben, Ergebnis, Sparquote, offene Buchungen, Summen je Art und je Kategorie (mit Vorjahr und Budget). Beträge in Euro, Ausgaben negativ.',
  inputSchema: { type: 'object', properties: { year: { type: 'number', description: 'Jahr, z. B. 2026 (Standard: laufendes Jahr)' } } },
  handler: async ({ year }) => text(await get('/overview', { year })),
};
