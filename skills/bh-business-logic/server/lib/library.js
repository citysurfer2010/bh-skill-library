'use strict';
/** A searchable folder of Markdown recipes. Adding a file is enough, no code change needed. */
const fs = require('fs');
const path = require('path');

const ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const SNIPPET = 160;

function parse(id, text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const meta = {};
  for (const line of (m ? m[1] : '').split('\n')) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const key = line.slice(0, i).trim(); const value = line.slice(i + 1).trim();
    meta[key] = /^\[.*\]$/.test(value) ? value.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean) : value;
  }
  return { id, meta, body: m ? m[2].trim() : text.trim() };
}

function createLibrary(dir) {
  const all = () => fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => parse(f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8')));
  const summary = ({ id, meta }) => ({ id, title: meta.title, summary: meta.summary, ...(meta.status ? { status: meta.status } : {}) });
  const list = () => all().map(summary);
  function lookup(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error('Ungueltige ID');
    const hit = all().find((e) => e.id === id);
    if (!hit) throw new Error(`Nicht gefunden: ${id}`);
    return `# ${hit.meta.title}\n\n${hit.body}`;
  }
  function find(question) {
    const words = String(question || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
    return all().map((e) => {
      const head = `${e.meta.title} ${e.meta.summary} ${[].concat(e.meta.tags || []).join(' ')}`.toLowerCase(); const body = e.body.toLowerCase();
      const score = words.reduce((n, w) => n + (head.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
      const at = Math.max(0, Math.min(...words.map((w) => { const i = body.indexOf(w); return i < 0 ? Infinity : i; }).concat(body.length)) - 40);
      return { ...summary(e), score, snippet: e.body.slice(at, at + SNIPPET).replace(/\s+/g, ' ') };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  }
  return { list, lookup, find, all };
}

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const safe = (fn) => async (args) => { try { return text(await fn(args || {})); } catch (e) { return { ...text(e.message), isError: true }; } };

module.exports = { createLibrary, safe };
