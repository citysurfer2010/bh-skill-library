'use strict';
/** Reads "Ihre Zahlungen → Transaktionen" back to a date, and the items of single orders. Slow on purpose: one page at a time. */
const { context, save, hasSession, forget, LoginNeeded, credentials } = require('./session');
const login = require('./login');
const { parsePayments, parseItems, parseCards, invoiceLinks } = require('./parse');

const PAYMENTS = 'https://www.amazon.de/cpe/yourpayments/transactions';
const HISTORY = (year, start) => `https://www.amazon.de/your-orders/orders?timeFilter=year-${year}&startIndex=${start}`;
const ORDER = (id) => `https://www.amazon.de/gp/your-account/order-details?orderID=${encodeURIComponent(id)}`;
const MAX_ROUNDS = 150;
const pause = (page) => page.waitForTimeout(1200 + Math.floor(Math.random() * 800));

/** Runs in the page: each element holding an order number, widened to the row that also shows an amount, plus the date heading above it. */
function extractRows() {
  const ID = /[0-9D]\d{2}-\d{7}-\d{7}/; const DATE = /^\s*\d{1,2}\.\s*[A-Za-zäÄ]+\s+\d{4}\s*$/;
  const headings = [...document.querySelectorAll('div, span, h2, h3, h4')].filter((e) => !e.children.length && DATE.test(e.textContent || ''));
  const marks = [...document.querySelectorAll('a, span, div')].filter((e) => (!e.children.length && ID.test(e.textContent || '')) || (e.tagName === 'A' && ID.test(e.getAttribute('href') || '')));
  const rows = []; const seen = new Set();
  for (const m of marks) {
    let n = m; while (n && n !== document.body && !/€/.test(n.innerText || '')) n = n.parentElement;
    if (!n || n === document.body || seen.has(n)) continue;
    seen.add(n);
    let date = ''; for (const h of headings) if (h.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) date = h.textContent.trim();
    let text = n.innerText || ''; if (!ID.test(text)) text += ` ${m.getAttribute('href') || ''}`;
    rows.push({ text, date });
  }
  return rows;
}

/** Amazon redirects to the sign-in after the page has loaded, so wait for it to settle before deciding. */
async function guard(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  if (/\/ap\/(signin|mfa)|\/ax\/claim/.test(page.url())) { forget(); throw new LoginNeeded(); }
}

/** With the access from the .env the worker signs in again by itself; a code or captcha still needs the person. */
async function withLogin(fn) {
  try { return await fn(); } catch (e) {
    if (e.code !== 'login' || !credentials()) throw e;
    const r = await login.start();
    if (r.state !== 'ok') { const x = new LoginNeeded(); x.message = r.state === 'error' ? r.message : 'Amazon fragt nach einer Bestätigung. Bitte in der App anmelden.'; throw x; }
    return fn();
  }
}

async function payments(opts = {}) { return withLogin(() => readPayments(opts)); }
/**
 * The payments page loads more rows while scrolling (POST …/get-transactions) and drops rows far above, so every
 * round collects what is visible. A round scrolls up a little and down again: the loader reacts only when it comes
 * into view anew. Stops when the rows reach `since` or nothing new came for four rounds (checked 15.11.2026: back to 12/2021).
 */
async function readPayments({ since = '2021-01-01' } = {}) {
  if (!hasSession()) throw new LoginNeeded();
  const ctx = await context(); const page = await ctx.newPage(); const all = new Map(); let rounds = 0;
  const key = (p) => [p.orderId, p.date, p.cents, p.method].join('|');
  const collect = async () => { let fresh = 0; for (const r of parsePayments(await page.evaluate(extractRows))) if (!all.has(key(r))) { all.set(key(r), r); fresh += 1; } return fresh; };
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(PAYMENTS, { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page);
    await collect();
    for (let still = 0; rounds < MAX_ROUNDS && still < 4; rounds += 1) {
      if ([...all.values()].some((p) => p.date < since)) break;
      const loaded = page.waitForResponse((r) => /get-transactions/.test(r.url()), { timeout: 6000 }).catch(() => null);
      await page.mouse.move(640, 500); await page.mouse.wheel(0, -2500); await page.waitForTimeout(400);
      for (let k = 0; k < 8; k += 1) { await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
      await loaded; await page.waitForTimeout(1200);
      still = (await collect()) ? 0 : still + 1;
    }
    await save(ctx);
  } finally { await ctx.close().catch(() => {}); }
  return { rounds, payments: [...all.values()].filter((p) => p.date >= since) };
}

/**
 * Order history by year, ten orders a page: number, date, total and the items with their product links.
 * The payments page only shows the last weeks, so the history comes from here. stopAt: an order already known
 * (daily run: read the current year only up to there). year: read only this year, so the caller can store each
 * year at once and a broken run loses at most one year (15.11.2026).
 */
async function orders(opts = {}) { return withLogin(() => readOrders(opts)); }
async function readOrders({ since = '2021-01-01', stopAt = [], year: only = null } = {}) {
  if (!hasSession()) throw new LoginNeeded();
  const known = new Set(stopAt); const out = new Map(); let pages = 0; let reachedKnown = false;
  const ctx = await context(); const page = await ctx.newPage();
  try {
    for (let year = only || new Date().getFullYear(); year >= (only || Number(since.slice(0, 4))); year -= 1) {
      let stop = false;
      for (let start = 0; start < 500 && !stop; start += 10) {
        await page.goto(HISTORY(year, start), { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page); pages += 1;
        const cards = await page.$$eval('.order-card, .js-order-card', (cs) => cs.map((c) => ({ text: c.innerText, products: [...c.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/gp/video/detail/"]')].map((a) => ({ text: a.innerText || a.getAttribute('title') || '', href: a.getAttribute('href') })) })));
        for (const o of parseCards(cards)) { if (known.has(o.id)) { stop = true; reachedKnown = true; } else if (!o.date || o.date >= since) out.set(o.id, o); }
        if (cards.length < 10) stop = true;
      }
      if (known.size && stop) break; // daily run: the newest known order reached
    }
    await save(ctx);
  } finally { await ctx.close().catch(() => {}); }
  return { pages, reachedKnown, orders: [...out.values()] };
}

async function items(orderIds) { return withLogin(() => readItems(orderIds)); }
async function readItems(orderIds) {
  if (!hasSession()) throw new LoginNeeded();
  const ctx = await context(); const page = await ctx.newPage(); const out = {};
  try {
    for (const id of orderIds.slice(0, 60)) {
      await page.goto(ORDER(id), { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page);
      // Only the bought items: the rest of the page is recommendations ("Kunden kauften auch"). Digital orders (D01-…)
      // have no purchasedItems block; their item links carry the order page's ref "ppx_hzod" or go to Prime Video.
      out[id] = parseItems(await page.$$eval('[data-component="purchasedItems"] a[href*="/dp/"], [data-component="purchasedItems"] a[href*="/gp/product/"], [data-component="shipments"] a[href*="/dp/"], a[href*="ppx_hzod"][href*="/dp/"], a[href*="/gp/video/detail/"]', (as) => as.map((a) => ({ text: a.innerText || a.getAttribute('title') || '', href: a.getAttribute('href') }))));
    }
    await save(ctx);
  } finally { await ctx.close().catch(() => {}); }
  return out;
}

/**
 * Invoice of one order as PDF (base64). First the invoice popover of the order, the first PDF there is fetched
 * with the session's cookies; without one (older or digital orders) the printable order summary is saved as PDF.
 */
const INVOICES = (id) => `https://www.amazon.de/gp/shared-cs/ajax/invoice/invoice.html?orderId=${encodeURIComponent(id)}&relatedRequestId=bh&isADriveSubscription=&isBookingOrder=0`;
const SUMMARY = (id) => `https://www.amazon.de/gp/css/summary/print.html?orderID=${encodeURIComponent(id)}`;
async function invoice(orderId) { return withLogin(() => readInvoice(orderId)); }
async function readInvoice(orderId) {
  if (!hasSession()) throw new LoginNeeded();
  const ctx = await context(); const page = await ctx.newPage();
  try {
    await page.goto(INVOICES(orderId), { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page);
    // One invoice per seller or shipment: return all of them (23.11.2026: the first one alone missed items).
    const pdfs = [];
    for (const url of invoiceLinks(await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))).slice(0, 10)) {
      const r = await ctx.request.get(url, { timeout: 60_000 });
      if (r.ok() && /pdf/i.test(r.headers()['content-type'] || '')) pdfs.push((await r.body()).toString('base64'));
    }
    if (pdfs.length) { await save(ctx); return { orderId, source: 'invoice', pdf: pdfs[0], pdfs }; }
    await page.goto(SUMMARY(orderId), { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await save(ctx);
    return { orderId, source: 'summary', pdf: pdf.toString('base64') };
  } finally { await ctx.close().catch(() => {}); }
}

module.exports = { payments, items, orders, invoice, extractRows };
