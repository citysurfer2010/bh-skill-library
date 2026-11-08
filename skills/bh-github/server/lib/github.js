/** GitHub-REST-Client. Das Token liegt je User auf dem Gateway, nie im Container. */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const tokenFile = () => path.join(process.env.HOME || os.homedir(), '.config', 'bh-github', 'token');

function token() {
  try { return fs.readFileSync(tokenFile(), 'utf8').trim(); } catch { return null; }
}

async function gh(method, url, body, fetchImpl = fetch) {
  const t = token();
  if (!t) throw new Error('GitHub noch nicht verknuepft: im Container bh-github-connect ausfuehren und dem User Link und Code zeigen (Skill bh-github).');
  const r = await fetchImpl(`https://api.github.com${url}`, {
    method,
    headers: { authorization: `Bearer ${t}`, accept: 'application/vnd.github+json', 'user-agent': 'bh-github', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data };
}

const ok  = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const err = (op, r) => ({ content: [{ type: 'text', text: `${op}: HTTP ${r.status}: ${r.data?.message || ''}` }], isError: true });
const REPO = { type: 'string', description: 'owner/repo' };
const PR   = { type: 'number', description: 'Nummer des Pull Requests' };

module.exports = { gh, ok, err, REPO, PR, tokenFile };
