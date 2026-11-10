'use strict';
/** Everything Zottel remembers, per user. Every read is scoped to the owner of the chat. */
const crypto = require('crypto');
const { getDb } = require('./db');

const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(9).toString('hex');
const plain = (row) => (row ? { ...row } : null);
const all = (sql, ...args) => getDb().prepare(sql).all(...args).map(plain);

const listChats = (email) => all('SELECT id, title, mode, updated_at FROM chats WHERE user_email = ? ORDER BY updated_at DESC LIMIT 100', email);
const chatOf = (email, id) => plain(getDb().prepare('SELECT * FROM chats WHERE id = ? AND user_email = ?').get(id, email));

function createChat(email) {
  const id = newId(); const at = now();
  getDb().prepare('INSERT INTO chats (id, user_email, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, email, at, at);
  return chatOf(email, id);
}
const touchChat = (id) => getDb().prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now(), id);
const setTitle = (id, title) => getDb().prepare('UPDATE chats SET title = ? WHERE id = ?').run(title, id);
const setMode = (id, mode) => getDb().prepare('UPDATE chats SET mode = ? WHERE id = ?').run(mode, id);
const setSummary = (id, summary) => getDb().prepare('UPDATE chats SET summary = ? WHERE id = ?').run(summary, id);
const deleteChat = (id) => getDb().prepare('DELETE FROM chats WHERE id = ?').run(id);

function addMessage(chatId, { role, content = '', toolCalls = null, toolCallId = null, toolName = null }) {
  const r = getDb().prepare('INSERT INTO messages (chat_id, role, content, tool_calls, tool_call_id, tool_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(chatId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, toolCallId, toolName, now());
  touchChat(chatId);
  return Number(r.lastInsertRowid);
}
const parseMessage = (m) => ({ ...m, tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : null });
const activeMessages = (chatId) => all('SELECT * FROM messages WHERE chat_id = ? AND compacted = 0 ORDER BY id', chatId).map(parseMessage);
const visibleMessages = (chatId) => all("SELECT id, role, content, tool_name, tool_calls, created_at FROM messages WHERE chat_id = ? AND role IN ('user', 'assistant', 'tool') ORDER BY id", chatId).map(parseMessage);
const compactUpTo = (chatId, id) => getDb().prepare('UPDATE messages SET compacted = 1 WHERE chat_id = ? AND id <= ?').run(chatId, id);

function addCard(chatId, { tool, args, toolCallId }) {
  const id = newId();
  getDb().prepare("INSERT INTO cards (id, chat_id, tool, args, tool_call_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)").run(id, chatId, tool, JSON.stringify(args), toolCallId, now());
  return cardById(id);
}
const parseCard = (c) => (c ? { ...c, args: JSON.parse(c.args) } : null);
const cardById = (id) => parseCard(plain(getDb().prepare('SELECT * FROM cards WHERE id = ?').get(id)));
const cardsOf = (chatId) => all('SELECT * FROM cards WHERE chat_id = ? ORDER BY created_at', chatId).map(parseCard);
const pendingCount = (chatId) => getDb().prepare("SELECT count(*) AS n FROM cards WHERE chat_id = ? AND status = 'pending'").get(chatId).n;
const finishCard = (id, status, result) => getDb().prepare('UPDATE cards SET status = ?, result = ? WHERE id = ?').run(status, result, id);

function setSteps(chatId, steps) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM steps WHERE chat_id = ?').run(chatId);
    const insert = db.prepare('INSERT INTO steps (chat_id, position, text, done) VALUES (?, ?, ?, ?)');
    steps.forEach((s, i) => insert.run(chatId, i, String(s.text).slice(0, 200), s.done ? 1 : 0));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
const stepsOf = (chatId) => all('SELECT text, done FROM steps WHERE chat_id = ? ORDER BY position', chatId).map((s) => ({ text: s.text, done: !!s.done }));

const memoriesOf = (email) => all('SELECT id, text, created_at FROM memories WHERE user_email = ? ORDER BY id', email);
const addMemory = (email, text) => Number(getDb().prepare('INSERT INTO memories (user_email, text, created_at) VALUES (?, ?, ?)').run(email, String(text).slice(0, 500), now()).lastInsertRowid);
const forgetMemory = (email, id) => getDb().prepare('DELETE FROM memories WHERE id = ? AND user_email = ?').run(id, email).changes > 0;

const isTrusted = (email, tool) => !!getDb().prepare('SELECT 1 FROM trusted_tools WHERE user_email = ? AND tool = ?').get(email, tool);
const trust = (email, tool) => getDb().prepare('INSERT OR IGNORE INTO trusted_tools (user_email, tool) VALUES (?, ?)').run(email, tool);

module.exports = { listChats, chatOf, createChat, setTitle, setMode, setSummary, deleteChat, addMessage, activeMessages, visibleMessages, compactUpTo, addCard, cardById, cardsOf, pendingCount, finishCard, setSteps, stepsOf, memoriesOf, addMemory, forgetMemory, isTrusted, trust };
