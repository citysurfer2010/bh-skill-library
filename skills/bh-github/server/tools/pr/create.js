const { gh, ok, err, REPO } = require('../../lib/github.js');
module.exports = { name: 'pr_create', description: 'Creates a pull request. The branch must already be pushed.',
  inputSchema: { type: 'object', required: ['repo', 'head', 'title'], properties: { repo: REPO, head: { type: 'string' }, base: { type: 'string', description: 'Default: main' }, title: { type: 'string' }, body: { type: 'string' }, draft: { type: 'boolean' } } },
  async handler({ repo, head, base = 'main', title, body = '', draft = false }) {
    const r = await gh('POST', `/repos/${repo}/pulls`, { head, base, title, body, draft });
    return r.status === 201 ? ok({ number: r.data.number, url: r.data.html_url }) : err('pr_create', r);
  } };
