const { gh, ok, err } = require('../../lib/github.js');
module.exports = { name: 'auth_status', description: 'Zeigt, mit welchem GitHub-Konto das Gateway fuer diesen User verbunden ist.', inputSchema: { type: 'object', properties: {} },
  async handler() { const r = await gh('GET', '/user'); return r.status === 200 ? ok({ login: r.data.login }) : err('auth_status', r); } };
