'use strict';
/**
 * Who may see the finances: admins always, everyone else only when added to the access list.
 * API keys with the scope "finance" (used by the MCP tools for Zottel) follow the same rule: only a person with access
 * may create one, and removing a person from the list revokes their finance keys at once.
 */
const { getDb } = require('./db');

function mayUse(user) {
  return !!user && (user.role === 'admin' || !!getDb().prepare('SELECT 1 FROM access WHERE email = ?').get(user.email));
}

function revokeFinanceKeys(email) {
  return getDb().prepare("UPDATE api_keys SET revoked_at = ? WHERE owner_id = ? AND revoked_at IS NULL AND (',' || scopes || ',') LIKE '%,finance,%'")
    .run(new Date().toISOString(), String(email).toLowerCase()).changes;
}

module.exports = { mayUse, revokeFinanceKeys };
