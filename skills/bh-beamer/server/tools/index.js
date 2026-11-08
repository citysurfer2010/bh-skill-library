/**
 * Tool-Registry mit Auto-Discovery.
 *
 * Sammelt alle `tools/<domain>/<tool>.js` (jede exportiert
 * { name, description, inputSchema, handler }) zu drei Maps:
 *   - TOOLS         { [name]: tool }                 ← Dispatcher-Lookup
 *   - TOOL_NAMES    [name, name, ...]
 *   - TOOL_SCHEMAS  [{ name, description, inputSchema }, ...] ← tools/list-Response
 *
 * Während der Migration kann `tools/` partiell gefüllt sein — server.js mergt
 * über die Bridge die alten Inline-Tools dazu.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const TOOLS_DIR = __dirname;
const TOOL_LIST = [];

for (const entry of fs.readdirSync(TOOLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(TOOLS_DIR, entry.name);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const tool = require(path.join(dir, f));
    if (!tool || !tool.name || !tool.handler) {
      throw new Error(`Tool-File ${entry.name}/${f} exportiert kein {name, handler}`);
    }
    TOOL_LIST.push(tool);
  }
}

const TOOLS        = Object.fromEntries(TOOL_LIST.map((t) => [t.name, t]));
const TOOL_NAMES   = TOOL_LIST.map((t) => t.name);
const TOOL_SCHEMAS = TOOL_LIST.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

module.exports = { TOOLS, TOOL_NAMES, TOOL_SCHEMAS };
