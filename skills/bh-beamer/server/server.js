#!/usr/bin/env node
/**
 * bh-beamer MCP Server v26.11.12
 *
 *
 * Architecture:
 *   server.js          — MCP protocol handler (this file, ~70 lines)
 *   tools/<domain>/*   — Per tool: { name, description, inputSchema, handler }
 *   tools/index.js     — Auto-Discovery-Registry
 *
 */
'use strict';

const readline = require('readline');
const { TOOLS, TOOL_NAMES, TOOL_SCHEMAS } = require('./tools/index.js');

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { method, id, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities:    { tools: {} },
        serverInfo:      { name: 'bh-beamer', version: '26.11.12' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') return;

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOL_SCHEMAS } });
    return;
  }

  if (method === 'tools/call') {
    const tool = TOOLS[params?.name];
    if (!tool) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unbekanntes Tool: ${params?.name}` } });
      return;
    }
    try {
      const result = await tool.handler(params?.arguments || {});
      send({ jsonrpc: '2.0', id, result });
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true } });
    }
    return;
  }

  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unbekannte Methode: ${method}` } });
  }
});

rl.on('close', () => process.exit(0));
process.stdin.on('error', () => {});

process.stderr.write(`[bh-beamer] v26.11.12 started — ${TOOL_NAMES.length} Tools registriert.\n`);
