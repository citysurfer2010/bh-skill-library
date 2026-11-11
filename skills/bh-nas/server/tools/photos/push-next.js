const { guarded } = require('../../lib/dsm.js');
const { pushNext } = require('../../lib/photos.js');
module.exports = { name: 'push_next', description: 'Delivers the next slideshow picture to the BH Home. The image data never appears in the result.',
  inputSchema: { type: 'object', properties: { start: { type: 'string', description: '"all", "y" plus a year such as y2006, an album id, or "next" to continue' } } },
  handler: guarded(async ({ start }) => pushNext(start)) };
