'use strict';
/** Login as a short conversation: start with e-mail and password, answer what Amazon asks (code, captcha, approval). */
const { context, save, credentials, signedIn } = require('./session');


const START = 'https://www.amazon.de/cpe/yourpayments/transactions';
const PENDING_MS = 10 * 60_000;
const SEL = {
  // Amazon's sign-in changes; Nov 2026: email #ap_email_login in form#ap_login_form, a hidden password autofill hint on the first step.
  email: '#ap_email_login, #ap_email, input[type="email"][name="email"], input[name="email"]:visible', cont: '#continue, input#continue, #ap_login_form input[type="submit"], form[name="signIn"] input[type="submit"]',
  password: '#ap_password:visible, input[type="password"][name="password"]:visible', remember: 'input[name="rememberMe"]', submit: '#signInSubmit, #auth-signin-button, form[name="signIn"] input[type="submit"]',
  captchaImg: '#auth-captcha-image, img[src*="captcha"]', captchaIn: '#auth-captcha-guess, input[name="guess"], #captchacharacters',
  // New device check (Nov 2026: /ap/cvf/transactionapproval with #input-box-otp, code by e-mail or SMS).
  code: '#input-box-otp, input[name="otpCode"], #auth-mfa-otpcode, input[name="code"], #cvf-input-code, input[name="otc"]',
  codeSubmit: '#auth-signin-button, #cvf-submit-otp-button input, #cvf-submit-otp-button, input[type="submit"], button[type="submit"]',
  approve: '#resend-approval-link, [name="transactionApprovalStatus"], #channelDetailsForOtp, .transaction-approval-word-break',
  error: '#auth-error-message-box .a-list-item, #auth-error-message-box, #auth-warning-message-box, .a-alert-error .a-alert-content',
};
let pending = null;

/** Looks at the page after an action and says what is needed next. */
/** passwordSent: before that, a visible password field always wins (Amazon shows a passkey error next to it on its own). */
async function inspect(page, { passwordSent = false } = {}) {
  await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1000);
  const url = new URL(page.url());
  if (await signedIn(page.context())) return { state: 'ok' }; // only Amazon's session cookies prove a login
  if (!passwordSent && await page.locator(SEL.password).count()) return { state: 'password' };
  const img = page.locator(SEL.captchaImg).first();
  if (await img.count()) return { state: 'captcha', image: `data:image/png;base64,${(await img.screenshot()).toString('base64')}` };
  if (await page.locator(SEL.code).count()) return { state: 'code', prompt: 'Amazon hat dir einen Bestätigungscode geschickt (E-Mail oder SMS). Bitte hier eingeben.' };
  if (await page.locator(SEL.approve).count()) return { state: 'approve', prompt: 'Bitte die Anmeldung bei Amazon bestätigen (App oder E-Mail) und danach „Weiter“ wählen.' };
  const err = await page.locator(SEL.error).first().textContent().catch(() => null);
  if (err && !/passkey/i.test(err)) return { state: 'error', message: err.replace(/\s+/g, ' ').trim().slice(0, 300) };
  if (await page.locator(SEL.password).count()) return { state: 'password' };
  if (/^\/(ap|ax)\//.test(url.pathname)) return { state: 'error', message: `Amazon fragt etwas, das der Abruf noch nicht kennt (${url.pathname}).` };
  return { state: 'error', message: `Unerwartete Seite bei Amazon (${url.pathname})` };
}

async function typePassword(page) {
  await page.locator(SEL.password).first().fill(pending.password);
  await page.locator(SEL.remember).check().catch(() => {});
  await page.locator(SEL.submit).first().click();
  return inspect(page, { passwordSent: true });
}

async function conclude(r) {
  if (r.state === 'ok' && !(await signedIn(pending.ctx))) r = { state: 'error', message: 'Amazon hat die Anmeldung nicht bestätigt. Bitte Zugangsdaten prüfen.' };
  if (r.state === 'ok') { await save(pending.ctx); await pending.ctx.close().catch(() => {}); pending = null; }
  if (r.state === 'error' && pending) { await pending.ctx.close().catch(() => {}); pending = null; }
  return r;
}

async function start({ email, password } = {}) {
  if (!email || !password) ({ email, password } = credentials() || {});
  if (!email || !password) return { state: 'error', message: 'Kein Amazon-Zugang hinterlegt.' };
  if (pending) await pending.ctx.close().catch(() => {});
  const ctx = await context(true); const page = await ctx.newPage();
  pending = { ctx, page, password, at: Date.now() };
  await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!(await page.locator(SEL.email).count())) return conclude(await inspect(page));
  await page.locator(SEL.email).first().fill(email);
  if (await page.locator(SEL.password).count()) return conclude(await typePassword(page)); // one-page form
  await page.locator(SEL.cont).first().click();
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
    const field = page.locator(SEL.code).first(); await field.fill(String(code));
    await page.locator('input[name="rememberDevice"]').check().catch(() => {});
    // The submit of the code's own form, not the "send again" button next to it.
    const own = field.locator('xpath=ancestor::form[1]').locator('input[type="submit"], button[type="submit"]').first();
    await ((await own.count()) ? own : page.locator(SEL.codeSubmit).first()).click();
  } else await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  let r = await inspect(page);
  if (r.state === 'password') r = await typePassword(page);
  return conclude(r);
}

module.exports = { start, answer, inspect };
