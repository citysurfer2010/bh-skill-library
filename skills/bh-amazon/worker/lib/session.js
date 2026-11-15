'use strict';
/**
 * Browser and Amazon session. Only the session (cookies, "Angemeldet bleiben") is stored, never the password:
 * it stays in memory for the few minutes a login with follow-up questions (code, captcha, approval) may take.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const STATE = process.env.STATE_DIR || '/state';
const SESSION = path.join(STATE, 'session.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const IDLE_MS = 5 * 60_000;
let browser = null; let idle = null;

async function getBrowser() {
  if (!browser) browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  clearTimeout(idle); idle = setTimeout(() => closeBrowser(), IDLE_MS); idle.unref?.();
  return browser;
}
async function closeBrowser() { const b = browser; browser = null; if (b) await b.close().catch(() => {}); }

const hasSession = () => fs.existsSync(SESSION);
const forget = () => fs.rmSync(SESSION, { force: true });

async function context(fresh = false) {
  const b = await getBrowser();
  return b.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', userAgent: UA, viewport: { width: 1280, height: 900 }, storageState: !fresh && hasSession() ? SESSION : undefined });
}

async function save(ctx) {
  fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
  const tmp = `${SESSION}.tmp`; await ctx.storageState({ path: tmp }); fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, SESSION);
}

class LoginNeeded extends Error { constructor() { super('Die Amazon-Anmeldung ist abgelaufen. Bitte in der App neu verbinden.'); this.code = 'login'; } }

module.exports = { context, save, hasSession, forget, closeBrowser, LoginNeeded, SESSION };
