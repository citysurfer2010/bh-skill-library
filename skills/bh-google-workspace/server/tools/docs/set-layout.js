'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.setLayout — sets page format, margins and base font of a Google Doc.
 *
 * Why a separate primitive: Drive's HTML→Doc import ALWAYS creates
 * US Letter (612×792 pt) and ignores `@page { size: A4 }` — even when
 * the content of an already A4-sized file is replaced. A German
 * updateDocumentStyle of the Docs API corrects it (same technique as
 * setReportLayout in report/create-document.js).
 *
 * The base font is optional: inline `font-family` in the HTML survives the
 * import for fonts Google Docs knows (Inter, Lato, Roboto …), but NOT
 * for Source Sans Pro. fontFamily here applies the family afterwards
 * across the whole document — bold/italic/colors are kept because only
 * the weightedFontFamily field is written.
 */

const MM_TO_PT = 72 / 25.4;

const FORMATS = {
  a4:             { width: 595.28, height: 841.89 },
  'a4-landscape': { width: 841.89, height: 595.28 },
  letter:         { width: 612,    height: 792    },
};

function pt(mm) {
  return { magnitude: Math.round(mm * MM_TO_PT * 100) / 100, unit: 'PT' };
}

// Largest endIndex in the body = end of the document. endIndex-1 because the last
// paragraph break is not part of a formattable range.
function bodyEndIndex(doc) {
  let end = 1;
  for (const el of (doc.body?.content || [])) {
    if (typeof el.endIndex === 'number' && el.endIndex > end) end = el.endIndex;
  }
  return end;
}

module.exports = {
  name: 'docs.setLayout',
  description:
    'Sets page format (A4/A4 landscape/Letter), margins and optionally the base font of a Google Doc. ' +
    'REQUIRED after every HTML→Doc import: Drive always creates US Letter and ignores CSS @page. ' +
    'marginsMm either as a number (all four margins) or as {top,right,bottom,left}. ' +
    'fontFamily sets the font family per text run; bold is kept (weight is derived from bold).',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Doc ID' },
      format: { type: 'string', enum: ['a4', 'a4-landscape', 'letter'], description: 'Page format, default a4' },
      marginsMm: { description: 'Margins in mm — number for all four, or {top,right,bottom,left}' },
      fontFamily: { type: 'string', description: 'Base font for the whole document, e.g. "Inter"' },
    },
    required: ['documentId'],
  },
  handler: async ({ documentId, format, marginsMm, fontFamily }) => {
    if (!documentId) return err('documentId fehlt.');
    const fmt = format || 'a4';
    const size = FORMATS[fmt];
    if (!size) return err(`format unbekannt: ${fmt} (erlaubt: ${Object.keys(FORMATS).join(', ')})`);

    const documentStyle = {
      pageSize: { width: pt(size.width / MM_TO_PT), height: pt(size.height / MM_TO_PT) },
    };
    const fields = ['pageSize'];

    if (marginsMm !== undefined && marginsMm !== null) {
      const m = typeof marginsMm === 'number'
        ? { top: marginsMm, right: marginsMm, bottom: marginsMm, left: marginsMm }
        : marginsMm;
      for (const [key, side] of [['marginTop', 'top'], ['marginRight', 'right'], ['marginBottom', 'bottom'], ['marginLeft', 'left']]) {
        if (m[side] === undefined) continue;
        documentStyle[key] = pt(Number(m[side]));
        fields.push(key);
      }
    }

    const r = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      requests: [{ updateDocumentStyle: { documentStyle, fields: fields.join(',') } }],
    });
    if (r.status !== 200) return err(`updateDocumentStyle fehlgeschlagen (${r.status}): ${JSON.stringify(r.data).slice(0, 300)}`);

    let fontNote = '';
    if (fontFamily) {
      const doc = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}`);
      if (doc.status !== 200) return err(`Dokument nicht lesbar (${doc.status}).`);

      // Set per text run and derive the weight from run.textStyle.bold.
      // A blanket updateTextStyle over the whole document implicitly sets weight
      // to 400 and thereby flattens ALL bold (measured 21.09.2026 on an
      // imported H1: stayed Inter Regular).
      const requests = [];
      const walk = (content) => {
        for (const el of (content || [])) {
          if (el.paragraph) {
            for (const pe of (el.paragraph.elements || [])) {
              const run = pe.textRun;
              if (!run || !run.content || !run.content.trim()) continue;
              requests.push({ updateTextStyle: {
                range: { startIndex: pe.startIndex, endIndex: pe.endIndex },
                textStyle: { weightedFontFamily: { fontFamily, weight: run.textStyle?.bold ? 700 : 400 } },
                fields: 'weightedFontFamily',
              } });
            }
          }
          if (el.table) for (const row of (el.table.tableRows || [])) for (const cell of (row.tableCells || [])) walk(cell.content);
        }
      };
      walk(doc.data.body?.content);

      // The Docs API caps requests per batchUpdate — send in chunks.
      for (let i = 0; i < requests.length; i += 400) {
        const f = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
          requests: requests.slice(i, i + 400),
        });
        if (f.status !== 200) return err(`Schriftart setzen fehlgeschlagen (${f.status}): ${JSON.stringify(f.data).slice(0, 300)}`);
      }
      fontNote = `, Schrift ${fontFamily} (${requests.length} Läufe)`;
    }

    const mNote = marginsMm !== undefined && marginsMm !== null ? `, Ränder gesetzt` : '';
    return ok(`Layout gesetzt: ${fmt}${mNote}${fontNote} (${documentId})`);
  },
};
