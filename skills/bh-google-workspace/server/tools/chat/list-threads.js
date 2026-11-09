'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'chat.listThreads', description: 'Lists threads in a Google Chat space.', inputSchema: { type: 'object', properties: { spaceName: { type: 'string' }, pageSize: { type: 'number' } }, required: ['spaceName'] },
  handler: async ({ spaceName, pageSize = 20 }) => {
  const r = await gapiJSON('GET', `https://chat.googleapis.com/v1/${spaceName}/messages?pageSize=${pageSize}&orderBy=createTime desc`);
  if (r.status !== 200) return apiErr('chat.listThreads', r.status, r.data);
  const threads = new Map();
  for (const m of (r.data.messages || [])) {
    const tn = m.thread?.name || 'no-thread';
    if (!threads.has(tn)) threads.set(tn, { name: tn, preview: m.text || '' });
  }
  const lines = [...threads.values()].map(t => `${t.name}: ${t.preview.substring(0, 60)}`).join('\n');
  return ok(lines || 'Keine Threads.');},
};
