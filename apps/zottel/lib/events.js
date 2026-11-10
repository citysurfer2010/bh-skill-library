'use strict';
/** Live updates per chat for the open browser windows. */
const listeners = new Map();

function subscribe(chatId, send) {
  if (!listeners.has(chatId)) listeners.set(chatId, new Set());
  listeners.get(chatId).add(send);
  return () => { const set = listeners.get(chatId); set?.delete(send); if (set && !set.size) listeners.delete(chatId); };
}

function publish(chatId, event) { for (const send of listeners.get(chatId) || []) send(event); }

module.exports = { subscribe, publish };
