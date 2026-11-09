const { gh, ok, err } = require('../../lib/github.js');
module.exports = { name: 'auth_status', description: 'Shows which GitHub account the gateway is connected to for this user.', inputSchema: { type: 'object', properties: {} },
  async handler() { const r = await gh('GET', '/user'); return r.status === 200 ? ok({ login: r.data.login }) : err('auth_status', r); } };
