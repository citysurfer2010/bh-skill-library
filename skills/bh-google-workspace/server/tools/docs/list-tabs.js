'use strict';
const { apiErr, gapiJSON, okJson } = require('../../lib/gapi.js');

// Google Docs tabs: documents.get returns `tabs[]` only with includeTabsContent=true.
// Without the parameter only the first tab comes back, as legacy `body` —
// which is why docs.getText always reads the wrong section in tabbed documents.
function flatten(tabs, depth, out) {
  for (const t of tabs || []) {
    const props = t.tabProperties || {};
    out.push({
      tabId: props.tabId,
      title: props.title,
      index: props.index,
      depth,
      parentTabId: props.parentTabId || null,
    });
    flatten(t.childTabs, depth + 1, out);
  }
  return out;
}

module.exports = {
  name: 'docs.listTabs',
  description: 'Lists all tabs of a Google Doc (tabId, title, order, nesting). The tabId is the value after ?tab= in the doc URL and is required by docs.insertSection as the target.',
  inputSchema: {
    type: 'object',
    properties: { documentId: { type: 'string' } },
    required: ['documentId'],
  },
  handler: async ({ documentId }) => {
    const r = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}?includeTabsContent=true`);
    if (r.status !== 200) return apiErr('docs.listTabs', r.status, r.data);
    return okJson({ documentId, title: r.data.title, tabs: flatten(r.data.tabs, 0, []) });
  },
};
