'use strict';
/**
 * KI-Aufrufe laufen ausschließlich über das zentrale Gateway (OpenAI-kompatibel). Nie direkt beim Anbieter:
 * Das Gateway verwaltet Kosten, Modelle und Zugänge. Modelle sind Stufen: tier:fast, tier:balanced, tier:quality.
 */
const fs = require('fs');

const GATEWAY_URL = 'http://llm-gateway:18790/v1';
const TOKEN_FILE = '/etc/devbox/llm/token';
const TIMEOUT_MS = 120_000;

function readToken(tokenFile) {
  try {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  } catch (e) {
    throw new Error(`LLM-Token nicht lesbar (${tokenFile}): ${e.code || e.message}`);
  }
}

/** Liefert den Antworttext. tokenFile und fetchImpl sind nur für Tests überschreibbar, die Gateway-Adresse nicht. */
async function chat({ messages, model = 'tier:balanced', ...options }, { tokenFile = TOKEN_FILE, fetchImpl = fetch } = {}) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('messages required');
  const res = await fetchImpl(`${GATEWAY_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readToken(tokenFile)}` },
    body: JSON.stringify({ ...options, model, messages }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LLM-Gateway antwortet ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

module.exports = { chat, GATEWAY_URL, TOKEN_FILE };
