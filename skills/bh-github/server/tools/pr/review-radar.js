const { gh, ok, err, REPO, PR } = require('../../lib/github.js');
const brief = (x) => ({ author: x.user?.login, state: x.state, path: x.path, line: x.line, body: x.body, at: x.submitted_at || x.created_at });
module.exports = { name: 'pr_review_radar', description: 'Reads all three comment sources of a pull request: reviews, inline comments and discussion. Call before any action on a PR.',
  inputSchema: { type: 'object', required: ['repo', 'pr'], properties: { repo: REPO, pr: PR } },
  async handler({ repo, pr }) {
    const [reviews, inline, discussion] = await Promise.all([`/repos/${repo}/pulls/${pr}/reviews`, `/repos/${repo}/pulls/${pr}/comments`, `/repos/${repo}/issues/${pr}/comments`].map((u) => gh('GET', `${u}?per_page=100`)));
    for (const r of [reviews, inline, discussion]) if (r.status !== 200) return err('pr_review_radar', r);
    return ok({ reviews: reviews.data.map(brief), inline: inline.data.map(brief), discussion: discussion.data.map(brief) });
  } };
