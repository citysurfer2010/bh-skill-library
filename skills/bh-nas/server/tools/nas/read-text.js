const { checkPath, download, guarded } = require('../../lib/dsm.js');
const MAX = 256 * 1024;
module.exports = { name: 'read_text', description: 'Reads a text file from the Synology, at most 256 KB. No images or other binary files.',
  inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
  handler: guarded(async ({ path }) => {
    const r = await download(checkPath(path), MAX);
    if (r.body.subarray(0, 8192).includes(0)) throw new Error('Das ist keine Textdatei');
    return { path, gekuerzt: r.truncated, inhalt: r.body.subarray(0, MAX).toString('utf8') };
  }) };
