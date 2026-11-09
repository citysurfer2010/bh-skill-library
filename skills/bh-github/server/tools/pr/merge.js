const { gh, ok, err, REPO, PR } = require('../../lib/github.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { name: 'pr_merge', description: 'Merges a pull request. Call only after green checks and explicit user approval.',
  inputSchema: { type: 'object', required: ['repo', 'pr'], properties: { repo: REPO, pr: PR, method: { type: 'string', enum: ['squash', 'merge', 'rebase'] } } },
  async handler({ repo, pr, method = 'squash' }, { wait = sleep } = {}) {
    let r = await gh('GET', `/repos/${repo}/pulls/${pr}`);
    if (r.status !== 200) return err('pr_merge', r);
    if (r.data.merged) return ok('Bereits gemergt.');
    // GitHub computes mergeability asynchronously.
    for (let i = 0; i < 5 && r.data.mergeable === null; i++) { await wait(2000); r = await gh('GET', `/repos/${repo}/pulls/${pr}`); }
    if (!r.data.mergeable) return { content: [{ type: 'text', text: `Nicht mergebar (${r.data.mergeable_state}).` }], isError: true };
    const m = await gh('PUT', `/repos/${repo}/pulls/${pr}/merge`, { merge_method: method, sha: r.data.head.sha });
    return m.status === 200 ? ok({ merged: true, sha: m.data.sha }) : err('pr_merge', m);
  } };
