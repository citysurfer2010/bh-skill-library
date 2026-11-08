'use strict';
const { refreshAccessToken } = require('../../lib/auth.js');
const { err, ok } = require('../../lib/gapi.js');

module.exports = { name: 'auth.refreshToken', description: 'Erneuert den Google OAuth Access Token manuell.', inputSchema: { type: 'object', properties: {} },
  handler: async () => {
  try {
    await refreshAccessToken();
    return ok('Token erfolgreich erneuert.');
  } catch (e) {
    return err(`Token-Refresh fehlgeschlagen: ${e.message}`);
  }},
};
