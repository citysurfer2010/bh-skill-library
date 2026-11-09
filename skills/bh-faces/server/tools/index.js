/**
 * Tool registry with auto-discovery.
 *
 * Collects all `tools/<domain>/<tool>.js` (each exports
 * { name, description, inputSchema, handler }) into three maps:
 *   - TOOLS         { [name]: tool }                 ← Dispatcher-Lookup
 *   - TOOL_NAMES    [name, name, ...]
 *   - TOOL_SCHEMAS  [{ name, description, inputSchema }, ...] ← tools/list-Response
 *
 * During a migration `tools/` may be only partly filled — server.js merges
 * the old inline tools in through the bridge.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const TOOLS_DIR = __dirname;
const TOOL_LIST = [];

const ONLY = 'faces';

for (const entry of fs.readdirSync(TOOLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name !== ONLY) continue;
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
