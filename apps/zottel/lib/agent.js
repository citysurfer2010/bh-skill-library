'use strict';
/** The conversation loop: stream the answer, run tools, pause for confirmation cards, resume. */
const store = require('./store');
const gateway = require('./gateway');
const llm = require('./chat-llm');
const { isSafe } = require('./tool-policy');
const { LOCAL_TOOLS, findTools } = require('./agent-tools');
const { publish } = require('./events');
const { systemPrompt } = require('./prompt');

const MODEL = 'tier:balanced';
const SUMMARY_MODEL = 'tier:fast';
const MAX_ROUNDS = 12;
const RESULT_LIMIT = 16 * 1024;
const COMPACT_AFTER = 40;
const KEEP_RECENT = 14;

const running = new Map();
const isRunning = (chatId) => running.has(chatId);
const stop = (chatId) => running.get(chatId)?.abort();

const clip = (text) => (text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}\n[gekürzt]` : text);
const toApi = (m) => (m.role === 'tool'
  ? { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
  : { role: m.role, content: m.content || null, ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) });

function parseArgs(call) { try { return JSON.parse(call.function.arguments || '{}'); } catch { return null; } }

async function compact(chat) {
  const messages = store.activeMessages(chat.id);
  if (messages.length <= COMPACT_AFTER) return;
  // Cut at a user message: tool results must stay directly behind their call.
  const cut = messages.slice(0, -KEEP_RECENT).reverse().find((m) => m.role === 'user');
  const end = messages.findIndex((m) => m === cut);
  if (end <= 0) return;
  const older = messages.slice(0, end).filter((m) => m.content && m.role !== 'tool').map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 24_000);
  const prompt = `Fasse dieses Gespräch knapp auf Deutsch zusammen. Erhalte Entscheidungen, Namen, Zahlen und offene Punkte.\n\nBisherige Zusammenfassung:\n${chat.summary}\n\nGespräch:\n${older}`;
  const { content } = await llm.complete({ model: SUMMARY_MODEL, messages: [{ role: 'user', content: prompt }] });
  if (!content) return;
  store.setSummary(chat.id, content);
  store.compactUpTo(chat.id, messages[end - 1].id);
}

async function runLocal(chat, email, name, args) {
  if (name === 'find_tools') return findTools(email, args.query);
  if (name === 'remember') return `Gemerkt (Nr. ${store.addMemory(email, args.text)}).`;
  if (name === 'forget') return store.forgetMemory(email, Number(args.id)) ? 'Vergessen.' : 'Diesen Eintrag gibt es nicht.';
  if (name === 'show_steps') { store.setSteps(chat.id, args.steps || []); publish(chat.id, { type: 'steps', steps: store.stepsOf(chat.id) }); return 'Angezeigt.'; }
  return `Unbekanntes Werkzeug: ${name}`;
}

async function runPlatformTool(chat, email, call, name, args) {
  publish(chat.id, { type: 'tool', state: 'start', name });
  try {
    const result = clip(await gateway.callTool(email, name, args));
    publish(chat.id, { type: 'tool', state: 'done', name });
    return result;
  } catch (e) {
    publish(chat.id, { type: 'tool', state: 'failed', name });
    return `Fehler: ${e.message}`;
  }
}

async function handleCall(chat, email, call) {
  const save = (content, toolName) => store.addMessage(chat.id, { role: 'tool', content, toolCallId: call.id, toolName });
  const args = parseArgs(call);
  if (!args) return save('Fehler: Die Parameter waren kein gültiges JSON.', call.function.name);
  if (call.function.name !== 'use_tool') return save(await runLocal(chat, email, call.function.name, args), call.function.name);
  const name = String(args.name || '');
  const toolArgs = args.arguments || {};
  if (isSafe(name) || store.isTrusted(email, name)) {
    if (!isSafe(name) && chat.mode === 'look') return save('Du bist im Modus „Nur schauen“. Änderungen sind dort nicht möglich. Sag dem User, dass er auf „Machen“ wechseln kann.', name);
    return save(await runPlatformTool(chat, email, call, name, toolArgs), name);
  }
  if (chat.mode === 'look') return save('Du bist im Modus „Nur schauen“. Änderungen sind dort nicht möglich. Sag dem User, dass er auf „Machen“ wechseln kann.', name);
  const card = store.addCard(chat.id, { tool: name, args: toolArgs, toolCallId: call.id });
  publish(chat.id, { type: 'card', card });
  return null;
}

async function loop(chatId, email) {
  if (running.has(chatId)) return;
  const controller = new AbortController();
  running.set(chatId, controller);
  publish(chatId, { type: 'state', state: 'thinking' });
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const chat = store.chatOf(email, chatId);
      if (!chat) return;
      await compact(chat);
      const fresh = store.chatOf(email, chatId);
      const messages = [{ role: 'system', content: systemPrompt(email, fresh) }, ...store.activeMessages(chatId).map(toApi)];
      const { content, toolCalls } = await llm.complete({ model: MODEL, messages, tools: LOCAL_TOOLS, signal: controller.signal, onText: (text) => publish(chatId, { type: 'text', text }) });
      store.addMessage(chatId, { role: 'assistant', content, toolCalls: toolCalls.length ? toolCalls : null });
      publish(chatId, { type: 'message_end' });
      if (!toolCalls.length) break;
      for (const call of toolCalls) await handleCall(fresh, email, call);
      if (store.pendingCount(chatId)) { publish(chatId, { type: 'state', state: 'waiting' }); return; }
    }
    publish(chatId, { type: 'state', state: 'done' });
  } catch (e) {
    const aborted = controller.signal.aborted;
    publish(chatId, aborted ? { type: 'state', state: 'done' } : { type: 'error', message: 'Das hat gerade nicht geklappt. Bitte versuche es noch einmal.' });
    if (!aborted) console.error(`[zottel] ${e.message}`);
  } finally {
    running.delete(chatId);
  }
}

function sendMessage(chat, email, text) {
  store.addMessage(chat.id, { role: 'user', content: text });
  if (chat.title === 'Neues Gespräch') store.setTitle(chat.id, text.replace(/\s+/g, ' ').slice(0, 50));
  return loop(chat.id, email);
}

/** The user's answer to a card. Continues the conversation once no card is open any more. */
async function decide(card, email, decision) {
  if (decision === 'reject') {
    store.finishCard(card.id, 'rejected', null);
    store.addMessage(card.chat_id, { role: 'tool', content: 'Der User hat das abgelehnt. Führe es nicht aus und frage nach, was stattdessen passieren soll.', toolCallId: card.tool_call_id, toolName: card.tool });
  } else {
    if (decision === 'always') store.trust(email, card.tool);
    store.finishCard(card.id, 'running', null);
    const chat = store.chatOf(email, card.chat_id);
    let status = 'done'; let result;
    publish(chat.id, { type: 'tool', state: 'start', name: card.tool });
    try { result = clip(await gateway.callTool(email, card.tool, card.args)); publish(chat.id, { type: 'tool', state: 'done', name: card.tool }); } catch (e) { status = 'failed'; result = `Fehler: ${e.message}`; publish(chat.id, { type: 'tool', state: 'failed', name: card.tool }); }
    store.finishCard(card.id, status, result.slice(0, 500));
    store.addMessage(card.chat_id, { role: 'tool', content: result, toolCallId: card.tool_call_id, toolName: card.tool });
  }
  publish(card.chat_id, { type: 'card', card: store.cardById(card.id) });
  if (!store.pendingCount(card.chat_id)) await loop(card.chat_id, email);
}

module.exports = { sendMessage, decide, isRunning, stop };
