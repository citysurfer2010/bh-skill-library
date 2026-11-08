'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.setLayout — Seitenformat, Ränder und Grundschrift eines Google Docs setzen.
 *
 * Warum als eigenes Primitiv: Der HTML→Doc-Import von Drive erzeugt IMMER
 * US Letter (612×792 pt) und ignoriert `@page { size: A4 }` — auch dann, wenn
 * der Inhalt einer bereits A4-großen Datei ersetzt wird. Ein deutsches
 * updateDocumentStyle der Docs-API korrigieren (gleiche Technik wie
 * setReportLayout in report/create-document.js).
 *
 * Die Grundschrift ist optional: Inline-`font-family` im HTML überlebt den
 * Import für Schriften, die Google Docs kennt (Inter, Lato, Roboto …), NICHT
 * aber für Source Sans Pro. fontFamily hier setzt die Familie nachträglich
 * über das gesamte Dokument — Fett/Kursiv/Farben bleiben erhalten, weil nur
 * das Feld weightedFontFamily geschrieben wird.
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

// Größter endIndex im Body = Ende des Dokuments. endIndex-1, weil der letzte
// Absatzumbruch nicht Teil eines formatierbaren Bereichs ist.
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
    'Setzt Seitenformat (A4/A4-quer/Letter), Seitenränder und optional die Grundschrift eines Google Docs. ' +
    'PFLICHT nach jedem HTML→Doc-Import: Drive erzeugt dabei immer US Letter und ignoriert CSS @page. ' +
    'marginsMm entweder als Zahl (alle vier Ränder) oder als {top,right,bottom,left}. ' +
    'fontFamily setzt die Schriftfamilie je Textlauf; Fettungen bleiben erhalten (Gewicht wird aus bold abgeleitet).',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google-Doc-ID' },
      format: { type: 'string', enum: ['a4', 'a4-landscape', 'letter'], description: 'Seitenformat, Default a4' },
      marginsMm: { description: 'Seitenränder in mm — Zahl für alle vier, oder {top,right,bottom,left}' },
      fontFamily: { type: 'string', description: 'Grundschrift für das ganze Dokument, z.B. "Inter"' },
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

      // Je Textlauf einzeln setzen und das Gewicht aus run.textStyle.bold ableiten.
      // Ein pauschales updateTextStyle über das ganze Dokument setzt weight implizit
      // auf 400 und macht damit JEDE Fettung platt (gemessen 21.09.2026 an einer
      // importierten H1: blieb Inter-Regular).
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

      // Docs-API deckelt die Requests pro batchUpdate — in Blöcken schicken.
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
