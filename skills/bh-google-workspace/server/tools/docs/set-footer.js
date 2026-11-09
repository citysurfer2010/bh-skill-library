'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.setFooter — sets a REAL Google Docs footer (segment DEFAULT).
 *
 * Why a separate primitive: on HTML→Doc import Drive creates NO footer —
 * a <footer> element just lands as the last paragraph in the body. A real footer
 * repeated on every page is only possible via the Docs API (createFooter +
 * insertText, optionally insertPageNumber). Used by agent-actions.create_doc.
 */
module.exports = {
  name: 'docs.setFooter',
  description:
    'Sets a real footer (on every page) in a Google Doc. text = footer text. ' +
    'Idempotent: if a DEFAULT footer already exists, its content is replaced. ' +
    'Without this tool an HTML import creates NO footer. ' +
    'NOTE: the Docs API cannot insert automatic PAGE NUMBERS (no insertPageNumber' +
    'request, HTTP 400) — add them manually in the doc UI if needed.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Doc ID' },
      text: { type: 'string', description: 'Footer text, e.g. "RE SMART Management GmbH · Vertraulich"' },
      fontSize: { type: 'number', description: 'Font size in pt (default 8)' },
      color: { type: 'string', description: 'Hex color, default #64748b' },
    },
    required: ['documentId', 'text'],
  },
  handler: async ({ documentId, text, fontSize = 8, color = '#64748b' }) => {
    // 1) Look for an existing DEFAULT footer (else create one) — otherwise duplicates would arise.
    const docR = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}?fields=footers,documentStyle`);
    if (docR.status !== 200) return err(`Doc lesen fehlgeschlagen (${docR.status})`);
    let footerId = docR.data.documentStyle?.defaultFooterId
      || Object.keys(docR.data.footers || {})[0]
      || null;

    if (!footerId) {
      const cr = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
        { requests: [{ createFooter: { type: 'DEFAULT' } }] });
      if (cr.status !== 200) return err(`createFooter fehlgeschlagen (${cr.status}): ${JSON.stringify(cr.data).slice(0, 200)}`);
      footerId = cr.data.replies?.[0]?.createFooter?.footerId;
      if (!footerId) return err('createFooter lieferte keine footerId');
    } else {
      // Clear existing content (segment starts at 1; the last \n must stay).
      const seg = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}?fields=footers`);
      const el = seg.data.footers?.[footerId]?.content || [];
      const end = el.length ? el[el.length - 1].endIndex : 1;
      if (end > 2) {
        await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
          requests: [{ deleteContentRange: { range: { segmentId: footerId, startIndex: 0, endIndex: end - 1 } } }],
        });
      }
    }

    const rgb = (hex) => {
      const h = String(hex).replace('#', '');
      return { red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 };
    };
    // NO insertPageNumber — the Docs API does not know that request (HTTP 400
    // "Cannot find field"). Page numbers remain a UI step.
    const body = String(text);
    const requests = [
      { insertText: { location: { segmentId: footerId, index: 0 }, text: body } },
      {
        updateTextStyle: {
          range: { segmentId: footerId, startIndex: 0, endIndex: body.length },
          textStyle: { fontSize: { magnitude: fontSize, unit: 'PT' }, foregroundColor: { color: { rgbColor: rgb(color) } } },
          fields: 'fontSize,foregroundColor',
        },
      },
    ];

    const up = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, { requests });
    if (up.status !== 200) return err(`Fußzeile schreiben fehlgeschlagen (${up.status}): ${JSON.stringify(up.data).slice(0, 200)}`);
    return ok(`Fußzeile gesetzt (footerId ${footerId}).`);
  },
};
