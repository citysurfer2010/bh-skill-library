/**
 * Google Docs tabs — shared helpers.
 *
 * BACKGROUND (the classic that silently yields wrong results):
 * `documents.get` returns `tabs[]` ONLY with `?includeTabsContent=true`. Without the
 * parameter only the first tab comes back, as legacy `body` — a
 * read tool then dutifully reports success but has read the wrong section.
 * For BP docs (one tab per fiscal year) that is guaranteed to be the wrong one.
 *
 * Therefore: EVERY access here goes through fetchDoc() with includeTabsContent,
 * and write locations carry the tabId (loc/range).
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

// Write locations must carry the tabId, otherwise the insert lands in the first tab.
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
 * Content elements of the target tab.
 * Without tabId: first tab from tabs[] — NOT the legacy `body`. In tab docs
 * both are identical, but tabs[0] is the source that also knows the tabId.
 */
function resolveSegment(doc, tabId) {
  if (tabId) return findTab(doc.tabs, tabId)?.documentTab?.body?.content || null;
  const first = (doc.tabs || [])[0];
  return first?.documentTab?.body?.content || doc.body?.content || null;
}

// Without tabId the real tabId must still be sent when writing — otherwise the
// insert targets the legacy body and the indexes do not match the segment read.
function resolveTabId(doc, tabId) {
  if (tabId) return tabId;
  return (doc.tabs || [])[0]?.tabProperties?.tabId || null;
}

function paragraphText(el) {
  return (el.paragraph?.elements || []).map((pe) => pe.textRun?.content || '').join('');
}

// Text of a content tree, tables as pipe rows (recursive, cells included).
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

// Punctuation at the end of a URL is not part of the link.
const URL_RE = /https?:\/\/[^\s<>"]+/g;
function trimUrl(u) {
  return u.replace(/[).,;:]+$/, '');
}

/**
 * Style requests for a whole table row: text color and clickable URLs.
 * Both need the indexes AFTER filling — so always build on a freshly
 * read document. Text inserted via the API is NOT auto-linked
 * by Docs; without this step the sources block stays as dead
 * text in the document.
 */
function rowStyleRequests(row, tabId, rgb, linkify) {
  const reqs = [];
  for (const cell of row.tableCells || []) {
    for (const el of cell.content || []) {
      for (const pe of el.paragraph?.elements || []) {
        const txt = pe.textRun?.content;
        if (!txt || pe.startIndex == null) continue;
        const end = pe.startIndex + txt.length;
        // Do not color the trailing \n — otherwise the paragraph marker gets colored.
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
            // Otherwise Docs recolors linked text to its default blue. The
            // AI color must be kept, otherwise the sources block is no longer
            // recognizable as an AI entry — hence foregroundColor is written too.
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

// Whitespace-tolerant, case-insensitive — for cell/header comparisons.
function norm(s) {
  return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Pick a table in a tab's content: tableWithHeader (text in the header row)
 * beats tableStartIndex (exact startIndex from documents.get) beats
 * tableIndex (0-based, default 0). Returns { table, position } or { error }.
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
 * Determine the row — content-based (rowMatchColumn/rowMatchValue) beats
 * rowIndex, because the index shifts as soon as someone inserts a row.
 * Returns { rowIndex } or { error }.
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
 * Style requests for freshly inserted text from index `at`: color across the
 * whole text, clickable URLs (color stays on the link, otherwise Docs recolors
 * it blue). Must be in the SAME batchUpdate after the insertText — the
 * requests apply sequentially, so the ranges refer to the new text.
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
