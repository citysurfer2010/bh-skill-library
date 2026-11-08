const { startLogin } = require('../../lib/oauth-login.js');
const { ok, err } = require('../../lib/gapi.js');
module.exports = { name: 'auth.loginStart', description: 'Startet die Google-Anmeldung und liefert einen Link fuer den Browser des Users.',
  inputSchema: { type: 'object', properties: { readOnly: { type: 'boolean', description: 'Nur Leserechte anfordern' }, withChat: { type: 'boolean', description: 'Google Chat einbeziehen (nur Workspace-Konten)' } } },
  async handler(args) {
    try {
      return ok(`Bitte diesen Link oeffnen und zustimmen. Danach zeigt der Browser eine Fehlerseite auf localhost; das ist richtig. Die komplette Adresse aus der Adresszeile hier einfuegen.\n\n${startLogin(args)}`);
    } catch (e) { return err(e.message); }
  } };
