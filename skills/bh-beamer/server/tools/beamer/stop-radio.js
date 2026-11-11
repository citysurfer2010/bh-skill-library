const { guarded } = require('../../lib/remote.js');
const { stopRadio } = require('../../lib/screen.js');
module.exports = { name: 'stop_radio', description: 'Stops the radio in the BH Home app.', inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => { await stopRadio(); return 'Radio beendet.'; }) };
