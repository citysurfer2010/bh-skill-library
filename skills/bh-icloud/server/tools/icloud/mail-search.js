const { guarded, clamp } = require('../../lib/credentials.js');
const { searchMail } = require('../../lib/mail.js');
module.exports = { name: 'mail_search', description: 'Searches iCloud Mail, newest first, and returns headers only. Messages stay unread.',
  inputSchema: { type: 'object', properties: {
    folder: { type: 'string', description: 'Default INBOX' },
    query: { type: 'string', description: 'Text anywhere in the message' },
    from: { type: 'string' },
    subject: { type: 'string' },
    since: { type: 'string', description: 'YYYY-MM-DD' },
    before: { type: 'string', description: 'YYYY-MM-DD' },
    unread: { type: 'boolean' },
    limit: { type: 'number', description: 'Default 20, max 100' },
  } },
  handler: guarded(async ({ folder = 'INBOX', limit, query, from, subject, since, before, unread }) => searchMail({ folder, limit: clamp(limit, 20, 100), query, from, subject, since, before, unread })) };
