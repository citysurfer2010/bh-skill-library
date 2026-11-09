'use strict';
const { clearCreds } = require('../../lib/auth.js');
const { err, ok } = require('../../lib/gapi.js');

module.exports = { name: 'auth.clear', description: 'Deletes stored Google credentials (re-authentication required).', inputSchema: { type: 'object', properties: {} },
  handler: async () => {
  try {
    clearCreds();
    return ok('Credentials gelöscht. Neuauthentifizierung erforderlich.');
  } catch (e) {
    return err(`Fehler beim Löschen: ${e.message}`);
  }},
};
