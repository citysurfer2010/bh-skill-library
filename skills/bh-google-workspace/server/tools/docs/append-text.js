'use strict';
const { apiErr, err, ok } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, findTab, flattenTabs, resolveSegment, resolveTabId,
} = require('../../lib/docs-tabs.js');

// Tabs: ohne includeTabsContent liefert documents.get nur den ersten Tab, und ein
// batchUpdate ohne tabId schreibt in den ersten Tab — beides ohne Fehler. Deshalb
// wird der Ziel-Tab ueber tabs[] aufgeloest, und eine unbekannte tabId ist ein

module.exports = {
  name: 'docs.appendText',
  description: 'Fügt Text am Ende eines Google Docs an. Bei Dokumenten mit Tabs tabId setzen (docs.listTabs) — ohne tabId landet der Text im ERSTEN Tab.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      text: { type: 'string' },
      tabId: { type: 'string', description: 'Ziel-Tab (Wert hinter ?tab= in der URL, s. docs.listTabs). Ohne Angabe: erster Tab.' },
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
