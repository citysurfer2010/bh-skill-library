'use strict';
const { apiErr, err, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'drive_share', description: 'Verwaltet Freigabeberechtigungen für eine Google Drive Datei oder einen Ordner. 🛑 type "anyone" macht die Datei ÖFFENTLICH zugänglich — nur auf ausdrücklichen Wunsch des Mitarbeiters und mit Rückfrage.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, emailAddress: { type: 'string', description: 'E-Mail-Adresse des Nutzers oder der Gruppe, mit der geteilt werden soll (optional).' }, role: { type: 'string', enum: ['reader', 'writer', 'commenter'], description: 'Die Rolle für den freigegebenen Nutzer (reader, writer, commenter). Standard ist \'reader\'.' }, type: { type: 'string', enum: ['user', 'group', 'domain', 'anyone'], description: 'Der Typ des zu erstellenden Berechtigungseintrags (user, group, domain, anyone).' }, sendNotificationEmail: { type: 'boolean', description: 'Ob eine Benachrichtigungs-E-Mail gesendet werden soll. Standard ist true.' }, emailMessage: { type: 'string', description: 'Die Nachricht, die in der Benachrichtigungs-E-Mail enthalten sein soll (optional).' } }, required: ['fileId'] },
  handler: async ({ fileId, emailAddress, role = 'reader', type, sendNotificationEmail = true, emailMessage, _blockProtectedDrives }) => {
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _ref = await refuseProtectedFile(fileId, toBlockSet(_blockProtectedDrives)); if (_ref) return _ref; }
  const permission = {
    role: role,
  };

  if (emailAddress) {
    permission.type = type || 'user';
    permission.emailAddress = emailAddress;
  } else if (type) {
    permission.type = type;
  } else {
    return err('Entweder emailAddress oder type muss angegeben werden.');
  }

  const queryParams = [`sendNotificationEmail=${sendNotificationEmail}`];
  if (emailMessage) {
    queryParams.push(`emailMessage=${encodeURIComponent(emailMessage)}`);
  }

  const r = await gapiJSON('POST', `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?${queryParams.join('&')}`, permission);

  if (r.status !== 200) return apiErr('drive_share', r.status, r.data);
  return ok(`Freigabe für Datei ${fileId} aktualisiert. Permission ID: ${r.data.id}`);},
};
