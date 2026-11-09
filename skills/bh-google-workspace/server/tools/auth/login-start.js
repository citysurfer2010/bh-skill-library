const { ok } = require('../../lib/gapi.js');
module.exports = { name: 'auth.loginStart', description: 'Explains where the user connects Google: in their own BH profile under Verbundene Dienste.',
  inputSchema: { type: 'object', properties: {} },
  async handler() { return ok('Bitte im BH-Profil unter „Verbundene Dienste“ bei Google-Dienste auf Verbinden klicken und zustimmen. Danach stehen die Werkzeuge sofort bereit.'); } };
