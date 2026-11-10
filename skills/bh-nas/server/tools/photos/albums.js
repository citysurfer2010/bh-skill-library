const { guarded } = require('../../lib/dsm.js');
const { albums } = require('../../lib/photos.js');
module.exports = { name: 'albums', description: 'Lists the photo albums (dated folders) for the slideshow, newest first, with their year. Paths stay on the server.',
  inputSchema: { type: 'object', properties: {} },
  handler: guarded(async () => (await albums()).map(({ id, label, when, year }) => ({ id, label, when, year }))) };
