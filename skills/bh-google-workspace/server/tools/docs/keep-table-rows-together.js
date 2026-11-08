'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.keepTableRowsTogether — verhindert, dass Tabellenzeilen am Seitenumbruch
 * zerschnitten werden (TableRowStyle.preventOverflow).
 *
 * gerahmten Unterpunkte (`section_box`) technisch einzeilige Tabellen. Ohne
 * preventOverflow trennt Google Docs so einen Kasten mitten im Rahmen — die
 * Bildunterschrift landet allein und ohne Rahmenunterkante auf der Folgeseite.
 * Bei mehrzeiligen Tabellen bleibt jede Zeile ganz, die Tabelle darf weiter
 * zwischen Zeilen umbrechen.
 *
 * Nur Tabellen auf Body-Ebene: verschachtelte Tabellen liegen ohnehin in einer
 * Zelle, die bereits als Ganzes umbricht.
 */
module.exports = {
  name: 'docs.keepTableRowsTogether',
  description:
    'Setzt preventOverflow auf alle Tabellenzeilen eines Google Docs, damit Kästen und Zeilen ' +
    'nicht am Seitenumbruch zerschnitten werden. Nach dem HTML-Import aufrufen, wenn das Dokument ' +
    'gerahmte Kästen enthält. prevent=false hebt es wieder auf.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google-Doc-ID' },
      prevent: { type: 'boolean', description: 'true (Default) = Zeilen zusammenhalten' },
    },
    required: ['documentId'],
  },
  handler: async ({ documentId, prevent }) => {
    if (!documentId) return err('documentId fehlt.');
    const value = prevent === undefined ? true : !!prevent;

    const doc = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}`);
    if (doc.status !== 200) return err(`Dokument nicht lesbar (${doc.status}).`);

    const requests = [];
    for (const el of (doc.data.body?.content || [])) {
      if (!el.table) continue;
      const rows = (el.table.tableRows || []).length;
      if (!rows) continue;
      requests.push({ updateTableRowStyle: {
        tableStartLocation: { index: el.startIndex },
        rowIndices: Array.from({ length: rows }, (_, i) => i),
        tableRowStyle: { preventOverflow: value },
        fields: 'preventOverflow',
      } });
    }
    if (!requests.length) return ok('Keine Tabellen gefunden — nichts geändert.');

    const r = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, { requests });
    if (r.status !== 200) return err(`updateTableRowStyle fehlgeschlagen (${r.status}): ${JSON.stringify(r.data).slice(0, 300)}`);

    return ok(`${requests.length} Tabelle(n) auf preventOverflow=${value} gesetzt.`);
  },
};
