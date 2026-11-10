'use strict';
/** What the model can call. Platform tools are found on demand, so the prompt stays small. */
const gateway = require('./gateway');

const LOCAL_TOOLS = [
  { name: 'find_tools', description: 'Search the available tools by keywords. Returns names, descriptions and parameters. Call this before use_tool.', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'Keywords, e.g. "calendar events" or "gmail send"' } } } },
  { name: 'use_tool', description: 'Run a tool found with find_tools. Reading runs at once, changes ask the user first.', parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, arguments: { type: 'object' } } } },
  { name: 'remember', description: 'Store a lasting fact about the user that helps in future conversations. Only when it is really useful.', parameters: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } },
  { name: 'forget', description: 'Delete a remembered fact by its id.', parameters: { type: 'object', required: ['id'], properties: { id: { type: 'number' } } } },
  { name: 'show_steps', description: 'Show the user your plan for a larger task with several steps. Send the complete list each time.', parameters: { type: 'object', required: ['steps'], properties: { steps: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, done: { type: 'boolean' } } } } } } },
].map((f) => ({ type: 'function', function: f }));

const MAX_MATCHES = 8;
const SCHEMA_LIMIT = 1500;

function score(tool, words) {
  const name = tool.name.toLowerCase(); const text = `${name} ${(tool.description || '').toLowerCase()}`;
  return words.reduce((sum, w) => sum + (name.includes(w) ? 3 : text.includes(w) ? 1 : 0), 0);
}

async function findTools(email, query) {
  const words = String(query || '').toLowerCase().split(/[^a-z0-9äöüß]+/).filter((w) => w.length > 1);
  const ranked = (await gateway.listTools(email)).map((t) => ({ t, s: score(t, words) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, MAX_MATCHES);
  if (!ranked.length) return 'Kein passendes Werkzeug gefunden.';
  return JSON.stringify(ranked.map(({ t }) => ({ name: t.name, description: String(t.description || '').slice(0, 400), parameters: JSON.stringify(t.inputSchema || {}).slice(0, SCHEMA_LIMIT) })));
}

module.exports = { LOCAL_TOOLS, findTools };
