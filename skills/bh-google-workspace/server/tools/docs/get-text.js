'use strict';
const { apiErr, err, ok } = require('../../lib/gapi.js');
const {
  fetchDoc, resolveSegment, findTab, findTabByTitle, flattenTabs, contentText,
} = require('../../lib/docs-tabs.js');

// Tabs: `documents.get` returns tabs[] only with includeTabsContent=true — otherwise
// only the first tab comes back, as legacy `body`. The parameter used to be set
// here ONLY when a tabId was given; without tabId the tool thus always read the
// first tab and still reported success. Now every run goes through tabs[], and whoever
// hits the wrong tab sees it in the header line.

module.exports = {
  name: 'docs.getText',
  description: 'Reads the text content of a Google Doc. Target tab via tabId (from docs.listTabs) or tabTitle; if omitted the first tab. Tables are output as pipe rows.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Tab (value after ?tab= in the URL, see docs.listTabs). If omitted: first tab.' },
      tabTitle: { type: 'string', description: 'Alternative to tabId: exact tab title, e.g. "2025er Belegpruefung".' },
      maxChars: { type: 'number', description: 'Truncation (default 10000).' },
      withHeader: { type: 'boolean', description: 'Prepend a header line with document/tab name (default true for docs with several tabs).' },
    },
    required: ['documentId'],
  },

  handler: async ({ documentId, tabId, tabTitle, maxChars = 10000, withHeader }) => {
    const r = await fetchDoc(documentId);
    if (r.status !== 200) return apiErr('docs.getText', r.status, r.data);

    const all = flattenTabs(r.data.tabs);

    let target = tabId;
    if (!target && tabTitle) {
      const t = findTabByTitle(r.data.tabs, tabTitle);
      if (!t) {
        return err(`docs.getText: Tab "${tabTitle}" nicht gefunden. Vorhanden: ${all.map((x) => x.title).join(' | ')}`);
      }
      target = t.tabProperties.tabId;
    }
    if (target && !findTab(r.data.tabs, target)) {
      return apiErr('docs.getText', 404, { error: { message: `Tab ${target} nicht gefunden. Vorhanden: ${all.map((x) => `${x.title} (${x.tabId})`).join(' | ')}` } });
    }

    const content = resolveSegment(r.data, target);
    if (!content) return err(`docs.getText: Tab ${target || '(erster)'} hat keinen lesbaren Inhalt.`);

    const shown = all.find((x) => x.tabId === (target || all[0]?.tabId));
    const showHeader = withHeader != null ? withHeader : all.length > 1;
    const head = showHeader
      ? `[Tab: ${shown?.title || '?'} (${shown?.tabId || '-'}) — ${all.length} Tab(s) im Dokument]\n\n`
      : '';

    return ok((head + contentText(content)).substring(0, maxChars));
  },
};
