const { gh, ok, err, REPO, PR } = require('../../lib/github.js');
module.exports = { name: 'pr_close', description: 'Closes a pull request without merging.',
  inputSchema: { type: 'object', required: ['repo', 'pr'], properties: { repo: REPO, pr: PR } },
  async handler({ repo, pr }) { const r = await gh('PATCH', `/repos/${repo}/pulls/${pr}`, { state: 'closed' }); return r.status === 200 ? ok('Geschlossen.') : err('pr_close', r); } };
