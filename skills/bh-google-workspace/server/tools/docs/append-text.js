'use strict';
const { apiErr, err, ok } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, findTab, flattenTabs, resolveSegment, resolveTabId,
} = require('../../lib/docs-tabs.js');

// Tabs: without includeTabsContent documents.get returns only the first tab, and a
// batchUpdate without tabId writes to the first tab — both without an error. Hence
// the target tab is resolved via tabs[], and an unknown tabId is an

module.exports = {
  name: 'docs.appendText',
  description: 'Appends text to the end of a Google Doc. For documents with tabs set tabId (docs.listTabs) — without tabId the text lands in the FIRST tab.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      text: { type: 'string' },
      tabId: { type: 'string', description: 'Target tab (value after ?tab= in the URL, see docs.listTabs). If omitted: first tab.' },
    },
    required: ['documentId', 'text'],
  },

  handler: async ({ documentId, text, tabId }) => {
    const dr = await fetchDoc(documentId);
    if (dr.status !== 200) return apiErr('docs.appendText (get)', dr.status, dr.data);

    if (tabId && !findTab(dr.data.tabs, tabId)) {
      const all = flattenTabs(dr.data.tabs);
      return err(`docs.appendText: Tab ${tabId} nicht gefunden. Vorhanden: ${all.map((x) => `${x.title} (${x.tabId})`).join(' | ') || 'keine'}`);
    }

    const content = resolveSegment(dr.data, tabId) || [];
    let endIndex = 1;
    for (const el of content) {
      if (el.endIndex) endIndex = Math.max(endIndex, el.endIndex - 1);
    }
    const target = resolveTabId(dr.data, tabId);

    const r = await batchUpdate(documentId, [{ insertText: { location: loc(endIndex, target), text } }]);
    if (r.status !== 200) return apiErr('docs.appendText', r.status, r.data);
    return ok(`Text am Ende angefügt (Index ${endIndex}${target ? `, Tab ${target}` : ''}).`);
  },
};
