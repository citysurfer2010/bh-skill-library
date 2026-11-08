/**
 * Google-Docs-Tabs — gemeinsame Helfer.
 *
 * HINTERGRUND (der Klassiker, der still falsche Ergebnisse liefert):
 * `documents.get` liefert `tabs[]` NUR mit `?includeTabsContent=true`. Ohne den
 * Parameter kommt ausschliesslich der erste Tab als legacy `body` zurueck — ein
 * Lese-Tool meldet dann brav Erfolg, hat aber den falschen Abschnitt gelesen.
 * Bei den BP-Docs (ein Tab pro Wirtschaftsjahr) ist das garantiert der falsche.
 *
 * Deshalb: JEDER Zugriff hier laeuft ueber fetchDoc() mit includeTabsContent,
 * und Schreib-Locations tragen die tabId mit (loc/range).
 */
'use strict';

const { gapiJSON } = require('./gapi.js');

const DOC_URL = (id, q) => `https://docs.googleapis.com/v1/documents/${id}${q || ''}`;

function fetchDoc(documentId) {
  return gapiJSON('GET', DOC_URL(documentId, '?includeTabsContent=true'));
}

function batchUpdate(documentId, requests) {
  return gapiJSON('POST', DOC_URL(documentId, ':batchUpdate'), { requests });
}

// Schreib-Locations muessen die tabId tragen, sonst landet der Insert im ersten Tab.
function loc(index, tabId) {
  return tabId ? { index, tabId } : { index };
}

function range(startIndex, endIndex, tabId) {
  return tabId ? { startIndex, endIndex, tabId } : { startIndex, endIndex };
}

function findTab(tabs, tabId) {
  for (const t of tabs || []) {
    if (t.tabProperties?.tabId === tabId) return t;
    const hit = findTab(t.childTabs, tabId);
    if (hit) return hit;
  }
  return null;
}

function findTabByTitle(tabs, title) {
  const want = String(title).trim().toLowerCase();
  for (const t of tabs || []) {
    if ((t.tabProperties?.title || '').trim().toLowerCase() === want) return t;
    const hit = findTabByTitle(t.childTabs, title);
    if (hit) return hit;
  }
  return null;
}

function flattenTabs(tabs, depth = 0, out = []) {
  for (const t of tabs || []) {
    const p = t.tabProperties || {};
    out.push({ tabId: p.tabId, title: p.title, index: p.index, depth, parentTabId: p.parentTabId || null });
    flattenTabs(t.childTabs, depth + 1, out);
  }
  return out;
}

/**
 * Content-Elemente des Ziel-Tabs.
 * Ohne tabId: erster Tab aus tabs[] — NICHT der legacy `body`. Bei Tab-Docs sind
 * beide zwar identisch, aber tabs[0] ist die Quelle, die auch die tabId kennt.
 */
function resolveSegment(doc, tabId) {
  if (tabId) return findTab(doc.tabs, tabId)?.documentTab?.body?.content || null;
  const first = (doc.tabs || [])[0];
  return first?.documentTab?.body?.content || doc.body?.content || null;
}

// Ohne tabId muss beim Schreiben trotzdem die echte tabId mit — sonst zielt der
// Insert auf den legacy body und die Indizes passen nicht zum gelesenen Segment.
function resolveTabId(doc, tabId) {
  if (tabId) return tabId;
  return (doc.tabs || [])[0]?.tabProperties?.tabId || null;
}

function paragraphText(el) {
  return (el.paragraph?.elements || []).map((pe) => pe.textRun?.content || '').join('');
}

// Text eines Content-Baums, Tabellen als Pipe-Zeilen (rekursiv, auch Zellen).
function contentText(content) {
  const out = [];
  for (const el of content || []) {
    if (el.paragraph) {
      out.push(paragraphText(el));
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        const cells = (row.tableCells || []).map((c) => contentText(c.content).trim().replace(/\s*\n+\s*/g, ' '));
        out.push(`| ${cells.join(' | ')} |\n`);
      }
    }
  }
  return out.join('');
}

function tablesIn(content) {
  return (content || []).filter((el) => el.table);
}

function cellText(cell) {
  return contentText(cell.content || []).replace(/\s+/g, ' ').trim();
}

function rowTexts(row) {
  return (row.tableCells || []).map(cellText);
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

// Satzzeichen am URL-Ende gehoeren nicht zum Link.
const URL_RE = /https?:\/\/[^\s<>"]+/g;
function trimUrl(u) {
  return u.replace(/[).,;:]+$/, '');
}

/**
 * Style-Requests fuer eine ganze Tabellenzeile: Textfarbe und klickbare URLs.
 * Beides braucht die Indizes NACH dem Befuellen — also immer auf einem frisch
 * gelesenen Dokument aufsetzen. Per API eingefuegter Text wird von Docs NICHT
 * automatisch verlinkt; ohne diesen Schritt steht der Quellen-Block als toter
 * Text im Dokument.
 */
function rowStyleRequests(row, tabId, rgb, linkify) {
  const reqs = [];
  for (const cell of row.tableCells || []) {
    for (const el of cell.content || []) {
      for (const pe of el.paragraph?.elements || []) {
        const txt = pe.textRun?.content;
        if (!txt || pe.startIndex == null) continue;
        const end = pe.startIndex + txt.length;
        // Abschliessendes \n nicht mitfaerben — sonst faerbt sich der Absatzmarker.
        const stop = txt.endsWith('\n') ? end - 1 : end;
        if (rgb && stop > pe.startIndex) {
          reqs.push({
            updateTextStyle: {
              range: range(pe.startIndex, stop, tabId),
              textStyle: { foregroundColor: { color: { rgbColor: rgb } } },
              fields: 'foregroundColor',
            },
          });
        }
        if (linkify) {
          let m;
          URL_RE.lastIndex = 0;
          while ((m = URL_RE.exec(txt)) !== null) {
            const url = trimUrl(m[0]);
            if (!url) continue;
            const s = pe.startIndex + m.index;
            // Docs faerbt verlinkten Text sonst auf sein Standard-Blau um. Die
            // AI-Farbe muss erhalten bleiben, sonst ist der Quellen-Block nicht
            // mehr als AI-Eintrag erkennbar — deshalb foregroundColor mitschreiben.
            reqs.push({
              updateTextStyle: {
                range: range(s, s + url.length, tabId),
                textStyle: {
                  link: { url },
                  underline: true,
                  ...(rgb ? { foregroundColor: { color: { rgbColor: rgb } } } : {}),
                },
                fields: rgb ? 'link,underline,foregroundColor' : 'link,underline',
              },
            });
          }
        }
      }
    }
  }
  return reqs;
}

// Whitespace-tolerant, case-insensitiv — fuer Zell-/Kopfzeilen-Vergleiche.
function norm(s) {
  return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Tabelle im Content eines Tabs waehlen: tableWithHeader (Text in der Kopfzeile)
 * schlaegt tableStartIndex (exakter startIndex aus documents.get) schlaegt
 * tableIndex (0-basiert, default 0). Liefert { table, position } oder { error }.
 */
function resolveTable(content, { tableIndex, tableWithHeader, tableStartIndex } = {}) {
  const tables = tablesIn(content);
  if (!tables.length) return { error: 'Im Ziel-Tab gibt es keine Tabelle.' };
  if (tableWithHeader) {
    const want = norm(tableWithHeader);
    const hit = tables.findIndex((t) => rowTexts(t.table.tableRows?.[0] || {}).some((c) => norm(c).includes(want)));
    if (hit === -1) return { error: `Keine Tabelle mit Kopfzeile "${tableWithHeader}".` };
    return { table: tables[hit], position: hit };
  }
  if (tableStartIndex != null) {
    const hit = tables.findIndex((t) => t.startIndex === Number(tableStartIndex));
    if (hit === -1) {
      return { error: `Keine Tabelle mit startIndex ${tableStartIndex} (vorhanden: ${tables.map((t) => t.startIndex).join(', ')}).` };
    }
    return { table: tables[hit], position: hit };
  }
  const idx = tableIndex == null ? 0 : tableIndex;
  if (idx < 0 || idx >= tables.length) {
    return { error: `tableIndex ${idx} ausserhalb des Bereichs — ${tables.length} Tabelle(n).` };
  }
  return { table: tables[idx], position: idx };
}

/**
 * Zeile bestimmen — inhaltsbasiert (rowMatchColumn/rowMatchValue) schlaegt
 * rowIndex, weil sich der Index verschiebt, sobald jemand eine Zeile einfuegt.
 * Liefert { rowIndex } oder { error }.
 */
function resolveRow(rows, { rowIndex, rowMatchColumn, rowMatchValue } = {}) {
  let ri = rowIndex;
  if (rowMatchValue != null) {
    const col = rowMatchColumn == null ? 3 : rowMatchColumn;
    const want = norm(rowMatchValue);
    ri = rows.findIndex((r) => norm(rowTexts(r)[col]) === want);
    if (ri === -1) return { error: `keine Zeile mit "${rowMatchValue}" in Spalte ${col}.` };
  }
  if (ri == null || ri < 0 || ri >= rows.length) {
    return { error: `rowIndex ${ri} ungueltig (${rows.length} Zeilen).` };
  }
  return { rowIndex: ri };
}

/**
 * Style-Requests fuer frisch eingefuegten Text ab Index `at`: Farbe ueber den
 * ganzen Text, klickbare URLs (Farbe bleibt am Link erhalten, sonst faerbt Docs
 * ihn blau um). Muss im SELBEN batchUpdate nach dem insertText stehen — die
 * Requests wirken sequenziell, die Ranges gelten also fuer den neuen Text.
 */
function insertedTextStyleRequests(at, text, tabId, rgb, linkify) {
  const reqs = [];
  const str = String(text);
  if (rgb && str.length > 0) {
    reqs.push({
      updateTextStyle: {
        range: range(at, at + str.length, tabId),
        textStyle: { foregroundColor: { color: { rgbColor: rgb } } },
        fields: 'foregroundColor',
      },
    });
  }
  if (linkify) {
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(str)) !== null) {
      const url = trimUrl(m[0]);
      if (!url) continue;
      const s = at + m.index;
      reqs.push({
        updateTextStyle: {
          range: range(s, s + url.length, tabId),
          textStyle: {
            link: { url },
            underline: true,
            ...(rgb ? { foregroundColor: { color: { rgbColor: rgb } } } : {}),
          },
          fields: rgb ? 'link,underline,foregroundColor' : 'link,underline',
        },
      });
    }
  }
  return reqs;
}

module.exports = {
  DOC_URL,
  norm,
  resolveTable,
  resolveRow,
  insertedTextStyleRequests,
  hexToRgb,
  rowStyleRequests,
  fetchDoc,
  batchUpdate,
  loc,
  range,
  findTab,
  findTabByTitle,
  flattenTabs,
  resolveSegment,
  resolveTabId,
  paragraphText,
  contentText,
  tablesIn,
  cellText,
  rowTexts,
};
