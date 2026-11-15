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

// A session counts only with Amazon's sign-in cookies; an empty file from a failed login is no session.
const SIGNED_IN = /^(at|sess-at|x)-acbde$/;
const hasSession = () => { try { return (JSON.parse(fs.readFileSync(SESSION, 'utf8')).cookies || []).some((c) => SIGNED_IN.test(c.name)); } catch { return false; } };
const forget = () => fs.rmSync(SESSION, { force: true });

async function context(fresh = false) {
  const b = await getBrowser();
  return b.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', userAgent: UA, viewport: { width: 1280, height: 900 }, storageState: !fresh && hasSession() ? SESSION : undefined });
}

async function save(ctx) {
  fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
  const tmp = `${SESSION}.tmp`; await ctx.storageState({ path: tmp }); fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, SESSION);
}

/** Stored Amazon access (Matti 15.11.2026: login in the .env), handed to this container only: {"email","password"}. */
function credentials() {
  try { const c = JSON.parse(fs.readFileSync(process.env.CREDENTIALS_FILE || '/run/bh-amazon/credentials', 'utf8')); return c.email && c.password ? c : null; } catch { return null; }
}

/** Amazon only hands out these cookies after a real login; without them the session is empty, whatever the page shows. */
async function signedIn(ctx) { return (await ctx.cookies('https://www.amazon.de')).some((c) => SIGNED_IN.test(c.name)); }

class LoginNeeded extends Error { constructor() { super('Die Amazon-Anmeldung ist abgelaufen. Bitte in der App neu verbinden.'); this.code = 'login'; } }

module.exports = { context, save, hasSession, forget, closeBrowser, LoginNeeded, SESSION, credentials, signedIn };
