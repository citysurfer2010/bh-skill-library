'use strict';
/**
 * Boots the app in this process on a free port. DATA_DIR is always a throwaway folder, never the real database.
 * Without TRUST_PROXY_AUTH and DEV_USER_* every test starts from zero.
 */
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
function tmpDir() {
  const base = process.env.TEST_TMP || path.join(APP, '.test-tmp');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, 'case-'));
}
if (!process.env.DATA_DIR) process.env.DATA_DIR = tmpDir();

function resetAuthEnv(env = {}) {
  for (const k of ['TRUST_PROXY_AUTH', 'DEV_USER_EMAIL', 'DEV_USER_ROLE']) delete process.env[k];
  Object.assign(process.env, env);
}

async function startApp() {
  resetAuthEnv({ TRUST_PROXY_AUTH: '1' });
  const app = require('../server');
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (url, { as, role, name, method = 'GET', body, headers = {}, ...rest } = {}) => fetch(base + url, {
    method,
    redirect: 'manual',
    headers: {
      ...(as ? { 'x-user-email': as } : {}),
      ...(role ? { 'x-user-role': role } : {}),
      ...(name ? { 'x-user-name': name } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  });
  return { base, call, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { APP, tmpDir, resetAuthEnv, startApp };
