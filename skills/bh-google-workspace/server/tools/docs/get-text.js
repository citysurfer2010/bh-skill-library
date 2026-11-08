'use strict';
const { apiErr, err, ok } = require('../../lib/gapi.js');
const {
  fetchDoc, resolveSegment, findTab, findTabByTitle, flattenTabs, contentText,
} = require('../../lib/docs-tabs.js');

// Tabs: `documents.get` liefert tabs[] nur mit includeTabsContent=true — sonst kommt
// ausschliesslich der erste Tab als legacy `body` zurueck. Frueher wurde der Parameter
// hier NUR gesetzt, wenn eine tabId mitkam; ohne tabId las das Tool damit immer den
// ersten Tab und meldete trotzdem Erfolg. Jetzt laeuft jeder Lauf ueber tabs[], und wer
// den falschen Tab erwischt, sieht es an der Kopfzeile.

module.exports = {
  name: 'docs.getText',
  description: 'Liest den Text-Inhalt eines Google Docs. Ziel-Tab per tabId (aus docs.listTabs) oder tabTitle; ohne Angabe der erste Tab. Tabellen werden als Pipe-Zeilen ausgegeben.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Tab (Wert hinter ?tab= in der URL, s. docs.listTabs). Ohne Angabe: erster Tab.' },
      tabTitle: { type: 'string', description: 'Alternative zu tabId: Tab-Titel exakt, z. B. "2025er Belegpruefung".' },
      maxChars: { type: 'number', description: 'Kuerzung (default 10000).' },
      withHeader: { type: 'boolean', description: 'Kopfzeile mit Dokument-/Tab-Namen voranstellen (default true bei Docs mit mehreren Tabs).' },
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
