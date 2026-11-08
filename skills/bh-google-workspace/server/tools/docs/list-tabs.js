'use strict';
const { apiErr, gapiJSON, okJson } = require('../../lib/gapi.js');

// Google Docs Tabs: documents.get liefert `tabs[]` nur mit includeTabsContent=true.
// Ohne den Parameter kommt ausschliesslich der erste Tab als legacy `body` zurueck —
// deshalb liest docs.getText bei Tab-Dokumenten immer den falschen Abschnitt.
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
  description: 'Listet alle Tabs eines Google Docs (tabId, Titel, Reihenfolge, Verschachtelung). Die tabId ist der Wert hinter ?tab= in der Doc-URL und wird von docs.insertSection als Ziel benoetigt.',
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
