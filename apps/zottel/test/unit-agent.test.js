'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zottel-'));
const store = require('../lib/store');
const agent = require('../lib/agent');
const gateway = require('../lib/gateway');
const llm = require('../lib/chat-llm');
const { isSafe } = require('../lib/tool-policy');
const events = require('../lib/events');

const ME = 'anna@beispiel.de';
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
function script(...replies) {
  const seen = [];
  llm.setStream(async ({ messages, onText }) => { seen.push(messages); const r = replies.shift() || { content: 'Fertig' }; if (r.content) onText?.(r.content); return { content: r.content || '', toolCalls: r.calls || [] }; });
  return seen;
}
function tools(handler) {
  const calls = [];
  gateway.setRpc(async (email, method, params) => {
    if (method === 'tools/list') return { tools: [{ name: 'google_gmail_send', description: 'send a mail', inputSchema: {} }, { name: 'icloud_events', description: 'list calendar events', inputSchema: {} }] };
    calls.push([email, params.name, params.arguments]);
    return handler ? handler(params) : { content: [{ type: 'text', text: 'ok' }] };
  });
  return calls;
}
const settled = async (id) => { for (let i = 0; i < 200 && agent.isRunning(id); i++) await new Promise((r) => setTimeout(r, 5)); };

test('policy: reading is safe, changes and unknown tools are not', () => {
  for (const n of ['icloud_events', 'google_gmail_search', 'github_pr_status', 'nas_list']) assert.equal(isSafe(n), true, n);
  for (const n of ['google_gmail_send', 'beamer_power', 'familycal_new_create', 'github_pr_merge', 'something_odd', 'google_drive_copy_file']) assert.equal(isSafe(n), false, n);
});

test('reading tool runs at once on behalf of the user', async () => {
  const chat = store.createChat(ME); const calls = tools();
  script({ calls: [call('1', 'use_tool', { name: 'icloud_events', arguments: { from: '2026-11-10' } })] }, { content: 'Du hast nichts vor.' });
  await agent.sendMessage(chat, ME, 'Was steht an?');
  assert.deepEqual(calls, [[ME, 'icloud_events', { from: '2026-11-10' }]]);
  assert.equal(store.visibleMessages(chat.id).at(-1).content, 'Du hast nichts vor.');
  assert.equal(store.chatOf(ME, chat.id).title, 'Was steht an?');
});

test('a change waits for the card and runs only after approval', async () => {
  const chat = store.createChat(ME); const calls = tools();
  script({ calls: [call('1', 'use_tool', { name: 'google_gmail_send', arguments: { to: 'a@b.de' } })] }, { content: 'Gesendet.' });
  await agent.sendMessage(chat, ME, 'Schick die Mail');
  assert.equal(calls.length, 0);
  const [card] = store.cardsOf(chat.id);
  assert.equal(card.status, 'pending');
  await agent.decide(card, ME, 'once');
  assert.deepEqual(calls, [[ME, 'google_gmail_send', { to: 'a@b.de' }]]);
  assert.equal(store.cardById(card.id).status, 'done');
  assert.equal(store.visibleMessages(chat.id).at(-1).content, 'Gesendet.');
});

test('a rejected card does not run and tells the model', async () => {
  const chat = store.createChat(ME); const calls = tools();
  const seen = script({ calls: [call('1', 'use_tool', { name: 'google_gmail_send', arguments: {} })] }, { content: 'Ok, nicht gesendet.' });
  await agent.sendMessage(chat, ME, 'Schick');
  await agent.decide(store.cardsOf(chat.id)[0], ME, 'reject');
  assert.equal(calls.length, 0);
  assert.match(seen.at(-1).at(-1).content, /abgelehnt/);
});

test('"always" trusts the tool for this user only', async () => {
  const chat = store.createChat(ME); const calls = tools();
  script({ calls: [call('1', 'use_tool', { name: 'beamer_power', arguments: {} })] }, { content: 'a' }, { calls: [call('2', 'use_tool', { name: 'beamer_power', arguments: {} })] }, { content: 'b' });
  await agent.sendMessage(chat, ME, 'an');
  await agent.decide(store.cardsOf(chat.id)[0], ME, 'always');
  await agent.sendMessage(store.chatOf(ME, chat.id), ME, 'nochmal');
  assert.equal(calls.length, 2); assert.equal(store.cardsOf(chat.id).length, 1);
  assert.equal(store.isTrusted('ben@beispiel.de', 'beamer_power'), false);
});

test('look mode never changes anything, not even trusted tools', async () => {
  store.trust(ME, 'beamer_power');
  const chat = store.createChat(ME); store.setMode(chat.id, 'look'); const calls = tools();
  const seen = script({ calls: [call('1', 'use_tool', { name: 'beamer_power', arguments: {} }), call('2', 'use_tool', { name: 'google_gmail_send', arguments: {} })] }, { content: 'Geht nicht.' });
  await agent.sendMessage(store.chatOf(ME, chat.id), ME, 'an');
  assert.equal(calls.length, 0); assert.equal(store.cardsOf(chat.id).length, 0);
  assert.match(seen.at(-1).at(-1).content, /Nur schauen/);
});

test('find_tools returns matches, a failing tool is reported, memory and steps work', async () => {
  const chat = store.createChat(ME);
  tools(() => ({ content: [{ type: 'text', text: 'kaputt' }], isError: true }));
  const seen = script(
    { calls: [call('1', 'find_tools', { query: 'calendar' }), call('2', 'use_tool', { name: 'icloud_events', arguments: {} }), call('3', 'remember', { text: 'Mag Tee' }), call('4', 'show_steps', { steps: [{ text: 'A', done: true }] })] },
    { content: 'x' });
  await agent.sendMessage(chat, ME, 'los');
  const results = seen.at(-1).filter((m) => m.role === 'tool').map((m) => m.content);
  assert.match(results[0], /icloud_events/); assert.match(results[1], /kaputt/);
  assert.ok(store.memoriesOf(ME).some((m) => m.text === 'Mag Tee'));
  assert.deepEqual(store.stepsOf(chat.id), [{ text: 'A', done: true }]);
});

test('long chats are summarised at a user message and keep working', async () => {
  const chat = store.createChat(ME); tools();
  for (let i = 0; i < 30; i++) { store.addMessage(chat.id, { role: 'user', content: `Frage ${i}` }); store.addMessage(chat.id, { role: 'assistant', content: `Antwort ${i}` }); }
  const seen = script({ content: 'Zusammenfassung' }, { content: 'Weiter' });
  await agent.sendMessage(chat, ME, 'Und jetzt?');
  assert.equal(store.chatOf(ME, chat.id).summary, 'Zusammenfassung');
  const sent = seen.at(-1);
  assert.equal(sent[1].role, 'user'); assert.ok(sent.length < 25); assert.match(sent[0].content, /Zusammenfassung/);
});

test('live events reach subscribers, a model failure gives a plain message', async () => {
  const chat = store.createChat(ME); const got = []; const off = events.subscribe(chat.id, (e) => got.push(e));
  llm.setStream(async () => { throw new Error('intern geheim'); });
  await agent.sendMessage(chat, ME, 'x'); off();
  const err = got.find((e) => e.type === 'error');
  assert.ok(err); assert.doesNotMatch(err.message, /geheim/); assert.equal(agent.isRunning(chat.id), false);
});
