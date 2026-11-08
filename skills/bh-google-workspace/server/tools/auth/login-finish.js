const { finishLogin } = require('../../lib/oauth-login.js');
const { ok, err } = require('../../lib/gapi.js');
module.exports = { name: 'auth.loginFinish', description: 'Schliesst die Google-Anmeldung ab. Erwartet die komplette Adresse der localhost-Seite nach der Zustimmung.',
  inputSchema: { type: 'object', required: ['redirectUrl'], properties: { redirectUrl: { type: 'string' } } },
  async handler({ redirectUrl }) {
    try { await finishLogin(redirectUrl); return ok('Google ist verbunden.'); } catch (e) { return err(e.message); }
  } };
