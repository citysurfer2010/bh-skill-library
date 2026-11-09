'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.updateRange', description: 'Overwrites a given range in a Google Sheets spreadsheet with new values (no append). Values are interpreted as if typed in the UI (valueInputOption=USER_ENTERED): =FORMULA becomes a formula, "27.08.2026" a date, "1234,56" a number. For raw text, prefix an apostrophe.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'e.g. "Sheet1!A2:I100"' }, values: { type: 'array', items: { type: 'array' }, description: 'Array of arrays with the new values' } }, required: ['spreadsheetId', 'range', 'values'] },
  // USER_ENTERED instead of RAW: values are treated as if a human had typed
  // them into the cell. The reason is a documented workflow — topic
  // "Since the Sheets tool was permanently switched to USER_ENTERED, the
  // =HYPERLINK formula is immediately interpreted correctly as a clickable link."
  //
  // Until today this change only ran in Bruno's runtime copy and was never canonical;
  // noticed 2026-08-20, because the next skill sync would have overwritten it with RAW and
  // thus silently broken the workflow: formulas as text, dates as strings,
  // numbers without summing — no error message, only visible in the sheet.
  //
  // To write raw text deliberately, prefix the value with an apostrophe ('=A1);
  // `sheets.appendRow` deliberately stays on RAW.
  handler: async ({ spreadsheetId, range, values }) => {
  const r = await gapiJSON('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { range, majorDimension: 'ROWS', values: values });
  if (r.status !== 200) return apiErr('sheets.updateRange', r.status, r.data);
  return ok(`Bereich erfolgreich aktualisiert. Aktualisierter Bereich: ${r.data.updatedRange}, Zeilen: ${r.data.updatedRows}`);},
};
