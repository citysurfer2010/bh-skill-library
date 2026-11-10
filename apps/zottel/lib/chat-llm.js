'use strict';
/** Streaming chat with tools through the central LLM gateway. */
const fs = require('fs');

const GATEWAY_URL = process.env.BH_LLM_URL || 'http://llm-gateway:18790/v1';
const TOKEN_FILE = process.env.BH_GATEWAY_TOKEN_FILE || '/etc/devbox/llm/token';
const TIMEOUT_MS = 180_000;

async function* sseLines(body) {
  const decoder = new TextDecoder(); let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1); if (line) yield line; }
  }
}

async function realStream({ messages, tools, model, signal, onText }) {
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${fs.readFileSync(TOKEN_FILE, 'utf8').trim()}` },
    body: JSON.stringify({ model, stream: true, messages, ...(tools?.length ? { tools } : {}) }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Sprachmodell antwortet mit Status ${res.status}`);
  let content = ''; const calls = [];
  for await (const line of sseLines(res.body)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') break;
    let delta; try { delta = JSON.parse(payload).choices?.[0]?.delta; } catch { continue; }
    if (!delta) continue;
    if (delta.content) { content += delta.content; onText?.(delta.content); }
    for (const c of delta.tool_calls || []) {
      const slot = (calls[c.index ?? 0] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (c.id) slot.id = c.id;
      if (c.function?.name) slot.function.name += c.function.name;
      if (c.function?.arguments) slot.function.arguments += c.function.arguments;
    }
  }
  return { content, toolCalls: calls.filter(Boolean) };
}

let stream = realStream;
const setStream = (fn) => { stream = fn || realStream; };
const complete = (options) => stream(options);

module.exports = { complete, setStream };
