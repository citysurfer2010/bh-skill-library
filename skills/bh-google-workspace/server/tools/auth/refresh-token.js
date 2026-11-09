'use strict';
const { refreshAccessToken } = require('../../lib/auth.js');
const { err, ok } = require('../../lib/gapi.js');

module.exports = { name: 'auth.refreshToken', description: 'Manually refreshes the Google OAuth access token.', inputSchema: { type: 'object', properties: {} },
  handler: async () => {
  try {
    await refreshAccessToken();
    return ok('Token erfolgreich erneuert.');
  } catch (e) {
    return err(`Token-Refresh fehlgeschlagen: ${e.message}`);
  }},
};
