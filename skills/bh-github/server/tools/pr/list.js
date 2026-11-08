const { gh, ok, err, REPO } = require('../../lib/github.js');
module.exports = { name: 'pr_list', description: 'Listet Pull Requests eines Repos.',
  inputSchema: { type: 'object', required: ['repo'], properties: { repo: REPO, state: { type: 'string', enum: ['open', 'closed', 'all'] } } },
  async handler({ repo, state = 'open' }) {
    const r = await gh('GET', `/repos/${repo}/pulls?state=${state}&per_page=50`);
    return r.status === 200 ? ok(r.data.map((p) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft, head: p.head.ref, author: p.user.login, url: p.html_url }))) : err('pr_list', r);
  } };
