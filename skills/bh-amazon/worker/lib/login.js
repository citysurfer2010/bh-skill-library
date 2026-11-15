'use strict';
/** Login as a short conversation: start with e-mail and password, answer what Amazon asks (code, captcha, approval). */
const { context, save } = require('./session');

const START = 'https://www.amazon.de/cpe/yourpayments/transactions';
const PENDING_MS = 10 * 60_000;
const SEL = {
  email: '#ap_email, input[name="email"]', cont: '#continue, input#continue', password: '#ap_password', remember: 'input[name="rememberMe"]', submit: '#signInSubmit',
  captchaImg: '#auth-captcha-image, img[src*="captcha"]', captchaIn: '#auth-captcha-guess, input[name="guess"], #captchacharacters',
  code: 'input[name="otpCode"], #auth-mfa-otpcode, input[name="code"], #cvf-input-code, input[name="otc"]',
  codeSubmit: '#auth-signin-button, #cvf-submit-otp-button input, #cvf-submit-otp-button, input[type="submit"], button[type="submit"]',
  approve: '#resend-approval-link, [name="transactionApprovalStatus"], #channelDetailsForOtp, .transaction-approval-word-break',
  error: '#auth-error-message-box .a-list-item, #auth-error-message-box, #auth-warning-message-box, .a-alert-error .a-alert-content',
};
let pending = null;

/** Looks at the page after an action and says what is needed next. */
async function inspect(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForTimeout(1500);
  const url = new URL(page.url());
  if (!url.pathname.startsWith('/ap/') && !url.pathname.includes('/cvf/') && !(await page.locator(SEL.password).count())) return { state: 'ok' };
  const img = page.locator(SEL.captchaImg).first();
  if (await img.count()) return { state: 'captcha', image: `data:image/png;base64,${(await img.screenshot()).toString('base64')}` };
  if (await page.locator(SEL.code).count()) return { state: 'code', prompt: ((await page.locator('h1').first().textContent().catch(() => '')) || 'Code eingeben').replace(/\s+/g, ' ').trim().slice(0, 160) };
  if (await page.locator(SEL.approve).count()) return { state: 'approve', prompt: 'Bitte die Anmeldung bei Amazon bestätigen (App oder E-Mail) und danach „Weiter“ wählen.' };
  const err = await page.locator(SEL.error).first().textContent().catch(() => null);
  if (err) return { state: 'error', message: err.replace(/\s+/g, ' ').trim().slice(0, 300) };
  if (await page.locator(SEL.password).count()) return { state: 'password' };
  return { state: 'error', message: `Unerwartete Seite bei Amazon (${url.pathname})` };
}

async function typePassword(page) {
  await page.fill(SEL.password, pending.password);
  await page.locator(SEL.remember).check().catch(() => {});
  await page.click(SEL.submit);
  return inspect(page);
}

async function conclude(r) {
  if (r.state === 'ok') { await save(pending.ctx); await pending.ctx.close().catch(() => {}); pending = null; }
  if (r.state === 'error' && pending) { await pending.ctx.close().catch(() => {}); pending = null; }
  return r;
}

async function start({ email, password }) {
  if (pending) await pending.ctx.close().catch(() => {});
  const ctx = await context(true); const page = await ctx.newPage();
  pending = { ctx, page, password, at: Date.now() };
  await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!(await page.locator(SEL.email).count())) return conclude(await inspect(page));
  await page.fill(SEL.email, email);
  if (await page.locator(SEL.password).count()) return conclude(await typePassword(page)); // one-page form
  await page.click(SEL.cont);
  let r = await inspect(page);
  if (r.state === 'password') r = await typePassword(page);
  return conclude(r);
}

/** code: one-time code; captcha: the letters; neither: "approved, go on". */
async function answer({ code, captcha } = {}) {
  if (!pending || Date.now() - pending.at > PENDING_MS) return { state: 'error', message: 'Die Anmeldung ist abgelaufen. Bitte neu beginnen.' };
  const { page } = pending;
  if (captcha) {
    await page.fill(SEL.captchaIn, String(captcha));
    if (await page.locator(SEL.password).count()) await page.fill(SEL.password, pending.password);
    await page.click(`${SEL.submit}, button[type="submit"], input[type="submit"]`);
  } else if (code) {
    await page.fill(SEL.code, String(code));
    await page.locator('input[name="rememberDevice"]').check().catch(() => {});
    await page.locator(SEL.codeSubmit).first().click();
  } else await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  let r = await inspect(page);
  if (r.state === 'password') r = await typePassword(page);
  return conclude(r);
}

module.exports = { start, answer, inspect };
