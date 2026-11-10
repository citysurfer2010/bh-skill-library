'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zottel-learn-'));
const store = require('../lib/store');
const routines = require('../lib/routines');
const lessons = require('../lib/lessons');
const agent = require('../lib/agent');
const llm = require('../lib/chat-llm');
const gateway = require('../lib/gateway');
const { nextRun } = require('../lib/schedule');
const { systemPrompt } = require('../lib/prompt');

const ME = 'lea@beispiel.de';
const settled = async (id) => { await new Promise((r) => setTimeout(r, 20)); for (let i = 0; i < 200 && agent.isRunning(id); i++) await new Promise((r) => setTimeout(r, 5)); };

test('schedule: Berlin time, next day after the slot, daylight saving, weekdays', () => {
  assert.equal(nextRun('07:00', [1, 2, 3, 4, 5, 6, 7], new Date('2026-11-10T05:00:00Z')).toISOString(), '2026-11-10T06:00:00.000Z');
  assert.equal(nextRun('07:00', [1, 2, 3, 4, 5, 6, 7], new Date('2026-11-10T06:30:00Z')).toISOString(), '2026-11-11T06:00:00.000Z');
  assert.equal(nextRun('07:00', [2], new Date('2026-07-01T00:00:00Z')).toISOString(), '2026-07-07T05:00:00.000Z');
  assert.equal(nextRun('07:00', [1], new Date('2026-10-24T10:00:00Z')).toISOString(), '2026-10-26T06:00:00.000Z');
  assert.equal(nextRun('7 Uhr', [1]), null); assert.equal(nextRun('07:00', []), null); assert.equal(nextRun('07:00', [8]), null);
});

test('lessons: suggestion first, active with the second signal, paused after two contradictions', () => {
  const l = lessons.learn(ME, { text: 'Termine immer mit Ort nennen', area: 'google' });
  assert.equal(l.status, 'candidate');
  assert.equal(lessons.learn(ME, { id: l.id }).status, 'active');
  assert.equal(lessons.contradict(ME, l.id).status, 'active');
  assert.equal(lessons.contradict(ME, l.id).status, 'paused');
  assert.equal(lessons.setStatus(ME, l.id, 'active'), true);
  assert.equal(lessons.get(ME, l.id).contradictions, 0);
  assert.equal(lessons.learn('ben@beispiel.de', { id: l.id }).error !== undefined, true);
  assert.ok(lessons.learn(ME, { text: 'kurz' }).error);
});

test('lessons: at most five new per day and five active in the prompt', () => {
  const email = 'viel@beispiel.de';
  for (let i = 0; i < 5; i++) { const l = lessons.learn(email, { text: `Regel Nummer ${i} lautet so` }); lessons.setStatus(email, l.id, 'active'); }
  assert.ok(lessons.learn(email, { text: 'Regel Nummer sechs lautet so' }).error);
  const prompt = systemPrompt(email, { kind: 'chat', mode: 'do', summary: '' });
  assert.equal((prompt.match(/Regel Nummer/g) || []).length, 5);
  assert.match(prompt, /Rules you learned/);
  const extra = lessons.list(email).find((l) => l.status !== 'active') || lessons.learn('andere@beispiel.de', { text: 'Noch eine Regel hier' });
  assert.equal(lessons.setStatus(email, extra.id, 'active'), false, 'a sixth rule cannot be switched on');
});

test('routines: validation, owner only, due run creates an unread conversation', async () => {
  assert.throws(() => routines.create(ME, { title: 'X', prompt: 'Y', time: '25:00', days: [1] }), /HH:MM/);
  const r = routines.create(ME, { title: 'Morgenblick', prompt: 'Was steht heute an?', time: '07:00', days: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(routines.get('ben@beispiel.de', r.id), null);
  gateway.setRpc(async () => ({ tools: [] }));
  const seen = [];
  llm.setStream(async ({ messages }) => { seen.push(messages); return { content: 'Heute ist frei.', toolCalls: [] }; });
  await agent.runRoutines(new Date(Date.parse(r.next_run) + 1000));
  const after = routines.get(ME, r.id);
  assert.ok(after.chat_id); await settled(after.chat_id);
  assert.ok(Date.parse(after.next_run) > Date.parse(r.next_run));
  const chat = store.listChats(ME).find((c) => c.id === after.chat_id);
  assert.equal(chat.kind, 'routine'); assert.equal(chat.unread, 1);
  assert.match(seen[0][0].content, /routine you run on your own/);
  assert.equal(store.visibleMessages(chat.id).at(-1).content, 'Heute ist frei.');
  await agent.runRoutines(new Date(Date.parse(r.next_run) + 2000));
  assert.equal(store.listChats(ME).filter((c) => c.kind === 'routine').length, 1, 'not due twice');
});

test('model tools: learn and routines through the conversation', async () => {
  const chat = store.createChat(ME);
  gateway.setRpc(async () => ({ tools: [] }));
  const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  const replies = [{ calls: [call('1', 'learn', { text: 'Mails an die Schule immer per Sie', area: 'google' }), call('2', 'routine_create', { title: 'Vokabeln', prompt: 'Frag mich 5 Vokabeln ab', time: '18:00', days: [1, 3, 5] }), call('3', 'routine_list', {})] }, { content: 'Erledigt.' }];
  const seen = [];
  llm.setStream(async ({ messages }) => { seen.push(messages); const r = replies.shift(); return { content: r.content || '', toolCalls: r.calls || [] }; });
  await agent.sendMessage(chat, ME, 'Merk dir das und frag mich Vokabeln ab');
  const results = seen.at(-1).filter((m) => m.role === 'tool').map((m) => m.content);
  assert.match(results[0], /Vorschlag/); assert.match(results[1], /Routine angelegt/); assert.match(results[2], /Mo, Mi, Fr um 18:00/);
});
