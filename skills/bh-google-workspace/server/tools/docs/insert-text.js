'use strict';
const { apiErr, err, ok } = require('../../lib/gapi.js');
const { fetchDoc, batchUpdate, loc, findTab, flattenTabs } = require('../../lib/docs-tabs.js');

// With tabId the tab is checked first: the API would silently write a location without a
// valid tab to the first tab. Without tabId the previous behavior remains
// (one call, first tab).

module.exports = {
  name: 'docs.insertText',
  description: 'Inserts text at a given position in a document. For documents with tabs set tabId (docs.listTabs) — the index then refers to that tab; without tabId to the FIRST tab.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      text: { type: 'string' },
      index: { type: 'number', description: 'Position (default: 1 = start)' },
      tabId: { type: 'string', description: 'Target tab (value after ?tab= in the URL, see docs.listTabs). If omitted: first tab.' },
    },
    required: ['documentId', 'text'],
  },

  handler: async ({ documentId, text, index = 1, tabId }) => {
    if (tabId) {
      const dr = await fetchDoc(documentId);
      if (dr.status !== 200) return apiErr('docs.insertText (get)', dr.status, dr.data);
      if (!findTab(dr.data.tabs, tabId)) {
        const all = flattenTabs(dr.data.tabs);
        return err(`docs.insertText: Tab ${tabId} nicht gefunden. Vorhanden: ${all.map((x) => `${x.title} (${x.tabId})`).join(' | ') || 'keine'}`);
      }
    }
    const r = await batchUpdate(documentId, [{ insertText: { location: loc(index, tabId), text } }]);
    if (r.status !== 200) return apiErr('docs.insertText', r.status, r.data);
    return ok(`Text bei Index ${index} eingefügt${tabId ? ` (Tab ${tabId})` : ''}.`);
  },
};
