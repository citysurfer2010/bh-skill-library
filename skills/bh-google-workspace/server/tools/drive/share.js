'use strict';
const { apiErr, err, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'drive_share', description: 'Manages sharing permissions for a Google Drive file or folder. 🛑 type "anyone" makes the file PUBLICLY accessible — only at the explicit request of the employee and after confirming.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, emailAddress: { type: 'string', description: 'Email address of the user or group to share with (optional).' }, role: { type: 'string', enum: ['reader', 'writer', 'commenter'], description: 'The role for the shared user (reader, writer, commenter). Default is \'reader\'.' }, type: { type: 'string', enum: ['user', 'group', 'domain', 'anyone'], description: 'The type of the permission entry to create (user, group, domain, anyone).' }, sendNotificationEmail: { type: 'boolean', description: 'Whether to send a notification email. Default is true.' }, emailMessage: { type: 'string', description: 'The message to include in the notification email (optional).' } }, required: ['fileId'] },
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
