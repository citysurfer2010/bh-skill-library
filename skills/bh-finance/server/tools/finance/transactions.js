'use strict';
const { get, text } = require('../../lib/api');

module.exports = {
  name: 'search_transactions',
  description: 'Buchungen suchen: Text, Gegenpartei oder gekaufter Amazon-Artikel (q), Kategorie-Kürzel (z. B. LEBEN, AKTIEN; OFFEN = nicht zugeordnet), Konto, Jahr oder "all". Liefert Anzahl und Summe aller Treffer und die neuesten Buchungen (höchstens limit, Standard 50). Ohne Konto nur Privatkonten, scope="all" für alle.',
  inputSchema: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Suchtext' },
      year: { type: ['number', 'string'], description: 'Jahr oder "all"' },
      category: { type: 'string', description: 'Kategorie-Kürzel oder OFFEN' },
      account: { type: 'string', description: 'Kontoname' },
      scope: { type: 'string', enum: ['all'], description: 'all = auch Immobilien- und Treuhandkonten' },
      limit: { type: 'number', description: '1 bis 200' },
    },
  },
  handler: async (a) => text(await get('/transactions', a)),
};
