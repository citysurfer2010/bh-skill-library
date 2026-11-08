'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, range, resolveSegment, resolveTabId,
  findTabByTitle, hexToRgb,
} = require('../../lib/docs-tabs.js');

/**
 * docs.styleText — formatiert vorhandenen Text nachtraeglich (fett, kursiv, Farbe,
 * Link, Unterstreichung), gefunden ueber seinen Wortlaut.
 *
 * Warum es das braucht: docs.replaceText kann nur Text tauschen, docs.appendText und
 * docs.appendToTableCell nur beim Einfuegen faerben. Wer nachtraeglich Ueberschriften
 * fetten oder eine per replaceText eingefuegte URL klickbar machen will, hatte bisher
 * kein Werkzeug — die Formatierung blieb Handarbeit im Browser.
 *
 * Typischer Fall (BP-Doc): die Kopfzeilen einer Verlaufs-Zelle fetten, ohne die
 * Zelle neu zu schreiben —
 *   docs.styleText(documentId, tabId, find: "Befund:", bold: true)
 * trifft alle Vorkommen im Tab, also alle Zeilen der Tabelle auf einmal.
 *
 * Grenzen, bewusst:
 *   - Der Suchtext muss INNERHALB EINES ABSATZES liegen. Google Docs speichert je
 *     Absatz eigene textRuns; ein Treffer ueber einen Absatzumbruch hinweg hat keinen
 *     zusammenhaengenden Index-Bereich. Mehrzeiliges bitte zeilenweise aufrufen.
 *   - Gesucht wird case-sensitive und exakt — wie bei docs.replaceText, damit beide
 *     Werkzeuge dieselben Treffer liefern.
 */

const norm = (s) => String(s == null ? '' : s);

// Baut je Absatz den Volltext samt Index-Karte: Position im String → Dokument-Index.
// Noetig, weil ein Absatz aus mehreren textRuns besteht und Treffer ueber deren
// Grenzen laufen koennen.
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

// Laeuft Absaetze UND Tabellenzellen ab — im BP-Doc steht alles Relevante in Zellen.
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
  description: 'Formatiert vorhandenen Text nachtraeglich: fett, kursiv, unterstrichen, Farbe, Link. Trefferauswahl ueber den Wortlaut (exakt, case-sensitive), tab-faehig. Ergaenzt docs.replaceText (tauscht nur Text) und docs.appendToTableCell (faerbt nur beim Einfuegen). Der Suchtext muss innerhalb eines Absatzes liegen.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Ziel-Tab (s. docs.listTabs). Ohne Angabe: erster Tab.' },
      tabTitle: { type: 'string', description: 'Alternative zu tabId: Tab-Titel exakt.' },
      find: { type: 'string', description: 'Zu formatierender Text, exakt und case-sensitive. Muss innerhalb eines Absatzes liegen.' },
      bold: { type: 'boolean', description: 'Fett setzen (true) oder aufheben (false).' },
      italic: { type: 'boolean', description: 'Kursiv setzen oder aufheben.' },
      underline: { type: 'boolean', description: 'Unterstreichen oder aufheben.' },
      color: { type: 'string', description: 'Hex-Schriftfarbe, z. B. "#D63384".' },
      link: { type: 'string', description: 'URL, mit der der Text verlinkt wird.' },
      maxOccurrences: { type: 'number', description: 'Nur die ersten N Treffer formatieren (default: alle).' },
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

    // Absteigend anwenden: Style-Requests verschieben zwar keine Indizes, aber die
    // Reihenfolge haelt die Requests deterministisch und damit nachvollziehbar.
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
