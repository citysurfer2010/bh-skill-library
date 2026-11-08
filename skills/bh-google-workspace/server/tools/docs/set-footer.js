'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.setFooter — setzt eine ECHTE Google-Docs-Fußzeile (Segment DEFAULT).
 *
 * Warum als eigenes Primitiv: Beim HTML→Doc-Import erzeugt Drive KEINE Fußzeile —
 * ein <footer>-Element landet einfach als letzter Absatz im Fließtext. Eine echte,
 * auf jeder Seite wiederholte Fußzeile geht nur über die Docs-API (createFooter +
 * insertText, optional insertPageNumber). Genutzt von agent-actions.create_doc.
 */
module.exports = {
  name: 'docs.setFooter',
  description:
    'Setzt eine echte Fußzeile (auf jeder Seite) in einem Google Doc. text = Fußzeilentext. ' +
    'Idempotent: existiert bereits eine DEFAULT-Fußzeile, wird deren Inhalt ersetzt. ' +
    'Ohne dieses Tool erzeugt ein HTML-Import KEINE Fußzeile. ' +
    'HINWEIS: Automatische SEITENZAHLEN kann die Docs-API nicht einfügen (kein insertPageNumber-' +
    'Request, HTTP 400) — die muessen bei Bedarf manuell in der Doc-UI ergaenzt werden.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google-Doc-ID' },
      text: { type: 'string', description: 'Fußzeilentext, z.B. "RE SMART Management GmbH · Vertraulich"' },
      fontSize: { type: 'number', description: 'Schriftgröße pt (Default 8)' },
      color: { type: 'string', description: 'Hex-Farbe, Default #64748b' },
    },
    required: ['documentId', 'text'],
  },
  handler: async ({ documentId, text, fontSize = 8, color = '#64748b' }) => {
    // 1) Bestehende DEFAULT-Fußzeile suchen (sonst neu anlegen) — sonst entstünden Duplikate.
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
      // Vorhandenen Inhalt leeren (Segment beginnt bei 1; letztes \n muss bleiben).
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
    // KEIN insertPageNumber — den Request kennt die Docs-API nicht (HTTP 400
    // "Cannot find field"). Seitenzahlen bleiben ein UI-Schritt.
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
