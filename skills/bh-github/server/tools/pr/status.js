const { gh, ok, err, REPO, PR } = require('../../lib/github.js');
module.exports = { name: 'pr_status', description: 'Shows the status of a pull request: state, branches, mergeability and checks.',
  inputSchema: { type: 'object', required: ['repo', 'pr'], properties: { repo: REPO, pr: PR } },
  async handler({ repo, pr }) {
    const r = await gh('GET', `/repos/${repo}/pulls/${pr}`);
    if (r.status !== 200) return err('pr_status', r);
    const c = await gh('GET', `/repos/${repo}/commits/${r.data.head.sha}/check-runs?per_page=50`);
    return ok({ state: r.data.state, merged: r.data.merged, draft: r.data.draft, head: r.data.head.ref, base: r.data.base.ref, mergeable: r.data.mergeable, mergeable_state: r.data.mergeable_state, url: r.data.html_url,
      checks: (c.data?.check_runs || []).map((x) => ({ name: x.name, status: x.status, conclusion: x.conclusion })) });
  } };
