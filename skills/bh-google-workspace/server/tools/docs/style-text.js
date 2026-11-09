'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, range, resolveSegment, resolveTabId,
  findTabByTitle, hexToRgb,
} = require('../../lib/docs-tabs.js');

/**
 * docs.styleText — formats existing text after the fact (bold, italic, color,
 * link, underline), found by its exact wording.
 *
 * Why it is needed: docs.replaceText can only swap text, docs.appendText and
 * docs.appendToTableCell only color on insert. Anyone wanting to bold headings later
 * or make a URL inserted via replaceText clickable previously had
 * no tool — the formatting stayed manual work in the browser.
 *
 * Typical case (BP doc): bold the header lines of a history cell without
 * rewriting the cell —
 *   docs.styleText(documentId, tabId, find: "Befund:", bold: true)
 * hits all occurrences in the tab, i.e. all rows of the table at once.
 *
 * Deliberate limits:
 *   - The search text must be WITHIN ONE PARAGRAPH. Google Docs stores separate
 *     textRuns per paragraph; a match across a paragraph break has no
 *     contiguous index range. Call line by line for multi-line text.
 *   - The search is case-sensitive and exact — as in docs.replaceText, so both
 *     tools return the same matches.
 */

const norm = (s) => String(s == null ? '' : s);

// Builds the full text per paragraph plus an index map: string position → document index.
// Needed because a paragraph consists of several textRuns and matches can cross
// their boundaries.
function paragraphRuns(el) {
  const out = { text: '', map: [] };
  for (const e of el.paragraph?.elements || []) {
    const t = e.textRun?.content;
    if (t == null || e.startIndex == null) continue;
    for (let i = 0; i < t.length; i++) {
      out.text += t[i];
      out.map.push(e.startIndex + i);
    }
  }
  return out;
}

// Walks paragraphs AND table cells — in the BP doc everything relevant is in cells.
function walk(content, hits, find) {
  for (const el of content || []) {
    if (el.paragraph) {
      const { text, map } = paragraphRuns(el);
      let from = 0;
      for (;;) {
        const i = text.indexOf(find, from);
        if (i === -1) break;
        const s = map[i];
        const e = map[i + find.length - 1];
        if (s != null && e != null) hits.push({ start: s, end: e + 1 });
        from = i + find.length;
      }
    }
    if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) walk(cell.content, hits, find);
      }
    }
  }
}

module.exports = {
  name: 'docs.styleText',
  description: 'Formats existing text after the fact: bold, italic, underline, color, link. Matches are selected by exact wording (case-sensitive), tab-aware. Complements docs.replaceText (only swaps text) and docs.appendToTableCell (only colors on insert). The search text must be within one paragraph.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Target tab (see docs.listTabs). If omitted: first tab.' },
      tabTitle: { type: 'string', description: 'Alternative to tabId: exact tab title.' },
      find: { type: 'string', description: 'Text to format, exact and case-sensitive. Must be within one paragraph.' },
      bold: { type: 'boolean', description: 'Set bold (true) or remove it (false).' },
      italic: { type: 'boolean', description: 'Set or remove italic.' },
      underline: { type: 'boolean', description: 'Set or remove underline.' },
      color: { type: 'string', description: 'Hex text color, e.g. "#D63384".' },
      link: { type: 'string', description: 'URL to link the text to.' },
      maxOccurrences: { type: 'number', description: 'Format only the first N matches (default: all).' },
    },
    required: ['documentId', 'find'],
  },

  handler: async ({ documentId, tabId, tabTitle, find, bold, italic, underline, color, link, maxOccurrences }) => {
    if (!find || !String(find).length) return err('docs.styleText: find ist leer.');
    if (String(find).includes('\n')) {
      return err('docs.styleText: find darf keinen Zeilenumbruch enthalten — Google Docs speichert je Absatz eigene Runs. Bitte zeilenweise aufrufen.');
    }
    if (bold == null && italic == null && underline == null && color == null && link == null) {
      return err('docs.styleText: keine Formatierung angegeben (bold, italic, underline, color oder link).');
    }

    const doc = await fetchDoc(documentId);
    if (doc.status !== 200) return apiErr('docs.styleText (get)', doc.status, doc.data);

    let targetTabId = tabId;
    if (!targetTabId && tabTitle) {
      const t = findTabByTitle(doc.data.tabs, tabTitle);
      if (!t) return err(`docs.styleText: Tab "${tabTitle}" nicht gefunden.`);
      targetTabId = t.tabProperties.tabId;
    }
    targetTabId = resolveTabId(doc.data, targetTabId);

    const content = resolveSegment(doc.data, targetTabId);
    if (!content) return err(`docs.styleText: Tab ${targetTabId || '(erster)'} nicht gefunden.`);

    const hits = [];
    walk(content, hits, norm(find));
    if (!hits.length) return okJson({ documentId, tabId: targetTabId, find, occurrences: 0, note: 'kein Treffer — Text exakt und case-sensitive pruefen' });

    const use = maxOccurrences > 0 ? hits.slice(0, maxOccurrences) : hits;

    const textStyle = {};
    const fields = [];
    if (bold != null) { textStyle.bold = !!bold; fields.push('bold'); }
    if (italic != null) { textStyle.italic = !!italic; fields.push('italic'); }
    if (underline != null) { textStyle.underline = !!underline; fields.push('underline'); }
    const rgb = hexToRgb(color);
    if (rgb) { textStyle.foregroundColor = { color: { rgbColor: rgb } }; fields.push('foregroundColor'); }
    if (link) { textStyle.link = { url: String(link) }; fields.push('link'); }

    // Apply in descending order: style requests do not shift indexes, but the
    // order keeps the requests deterministic and thus traceable.
    const reqs = use
      .slice()
      .sort((a, b) => b.start - a.start)
      .map((h) => ({
        updateTextStyle: {
          range: range(h.start, h.end, targetTabId),
          textStyle,
          fields: fields.join(','),
        },
      }));

    const r = await batchUpdate(documentId, reqs);
    if (r.status !== 200) return apiErr('docs.styleText (batchUpdate)', r.status, r.data);

    return okJson({
      documentId,
      tabId: targetTabId,
      find,
      occurrences: use.length,
      applied: fields,
    });
  },
};
