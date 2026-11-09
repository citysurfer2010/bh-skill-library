const { APPS, guarded, openApp } = require('../../lib/remote.js');
module.exports = { name: 'open_app', description: 'Starts an app on the Beamer.', inputSchema: { type: 'object', required: ['app'], properties: { app: { type: 'string', enum: Object.keys(APPS) } } },
  handler: guarded(async ({ app }) => { await openApp(app); return `${app} ist gestartet.`; }) };
