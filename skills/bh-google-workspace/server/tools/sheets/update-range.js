'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.updateRange', description: 'Überschreibt einen bestimmten Bereich in einer Google Sheets Tabelle mit neuen Werten (kein Anhängen). Werte werden wie bei Eingabe in der Oberfläche interpretiert (valueInputOption=USER_ENTERED): =FORMEL wird zur Formel, "27.08.2026" zum Datum, "1234,56" zur Zahl. Wer den Rohtext braucht, stellt ein Apostroph davor.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'z.B. "Sheet1!A2:I100"' }, values: { type: 'array', items: { type: 'array' }, description: 'Array von Arrays mit den neuen Werten' } }, required: ['spreadsheetId', 'range', 'values'] },
  // USER_ENTERED statt RAW: die Werte werden so behandelt, als haette sie ein Mensch
  // in die Zelle getippt. Grund ist ein dokumentierter Workflow — Topic
  // "Da das Sheets-Tool dauerhaft auf USER_ENTERED aktualisiert wurde, wird die
  // =HYPERLINK Formel sofort korrekt als klickbarer Link interpretiert."
  //
  // Diese Umstellung lief bis heute nur in Brunos Laufzeit-Kopie und war nie im Kanon;
  // aufgefallen 2026-08-20, weil der naechste Skill-Sync sie mit RAW ueberschrieben und
  // damit den Workflow still zerlegt haette: Formeln als Text, Datumsangaben als Strings,
  // Zahlen ohne Summierung — ohne Fehlermeldung, nur sichtbar im Sheet.
  //
  // Wer bewusst Rohtext schreiben will, stellt dem Wert ein Apostroph voran ('=A1);
  // `sheets.appendRow` bleibt absichtlich auf RAW.
  handler: async ({ spreadsheetId, range, values }) => {
  const r = await gapiJSON('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { range, majorDimension: 'ROWS', values: values });
  if (r.status !== 200) return apiErr('sheets.updateRange', r.status, r.data);
  return ok(`Bereich erfolgreich aktualisiert. Aktualisierter Bereich: ${r.data.updatedRange}, Zeilen: ${r.data.updatedRows}`);},
};
