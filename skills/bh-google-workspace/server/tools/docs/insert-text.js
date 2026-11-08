'use strict';
const { apiErr, err, ok } = require('../../lib/gapi.js');
const { fetchDoc, batchUpdate, loc, findTab, flattenTabs } = require('../../lib/docs-tabs.js');

// Mit tabId wird der Tab vorher geprueft: die API wuerde eine Location ohne gueltigen
// Tab still in den ersten Tab schreiben. Ohne tabId bleibt es beim bisherigen Verhalten
// (ein Aufruf, erster Tab).

module.exports = {
  name: 'docs.insertText',
  description: 'Fügt Text an einer bestimmten Position in ein Dokument ein. Bei Dokumenten mit Tabs tabId setzen (docs.listTabs) — der Index bezieht sich dann auf diesen Tab; ohne tabId auf den ERSTEN Tab.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      text: { type: 'string' },
      index: { type: 'number', description: 'Position (default: 1 = Anfang)' },
      tabId: { type: 'string', description: 'Ziel-Tab (Wert hinter ?tab= in der URL, s. docs.listTabs). Ohne Angabe: erster Tab.' },
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
