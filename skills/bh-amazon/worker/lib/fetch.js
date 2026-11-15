'use strict';
/** Reads "Ihre Zahlungen → Transaktionen" back to a date, and the items of single orders. Slow on purpose: one page at a time. */
const { context, save, hasSession, forget, LoginNeeded, credentials } = require('./session');
const login = require('./login');
const { parsePayments, parseItems, parseCards } = require('./parse');

const PAYMENTS = 'https://www.amazon.de/cpe/yourpayments/transactions';
const HISTORY = (year, start) => `https://www.amazon.de/your-orders/orders?timeFilter=year-${year}&startIndex=${start}`;
const ORDER = (id) => `https://www.amazon.de/gp/your-account/order-details?orderID=${encodeURIComponent(id)}`;
const MAX_PAGES = 300;
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
async function readPayments({ since = '2021-01-01' } = {}) {
  if (!hasSession()) throw new LoginNeeded();
  const ctx = await context(); const page = await ctx.newPage(); const all = []; let pages = 0;
  try {
    await page.goto(PAYMENTS, { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page);
    for (; pages < MAX_PAGES; pages += 1) {
      await pause(page);
      const rows = parsePayments(await page.evaluate(extractRows)); all.push(...rows);
      const oldest = rows.map((r) => r.date).sort()[0];
      if (!rows.length || (oldest && oldest < since)) break;
      const next = page.getByRole('button', { name: /^(weiter|nächste)/i }).or(page.getByRole('link', { name: /^(weiter|nächste)/i })).first();
      if (!(await next.count()) || await next.isDisabled().catch(() => false)) break;
      await next.click(); await page.waitForLoadState('domcontentloaded'); await guard(page);
    }
    await save(ctx);
  } finally { await ctx.close().catch(() => {}); }
  const seen = new Set();
  return { pages: pages + 1, payments: all.filter((p) => p.date >= since).filter((p) => { const k = [p.orderId, p.date, p.cents, p.method].join('|'); return !seen.has(k) && seen.add(k); }) };
}

/**
 * Order history by year, ten orders a page: number, date, total and the items with their product links.
 * The payments page only shows the last weeks, so the history comes from here. stopAt: an order already known
 * (daily run: read the current year only up to there).
 */
async function orders(opts = {}) { return withLogin(() => readOrders(opts)); }
async function readOrders({ since = '2021-01-01', stopAt = [] } = {}) {
  if (!hasSession()) throw new LoginNeeded();
  const known = new Set(stopAt); const out = new Map(); let pages = 0;
  const ctx = await context(); const page = await ctx.newPage();
  try {
    for (let year = new Date().getFullYear(); year >= Number(since.slice(0, 4)); year -= 1) {
      let stop = false;
      for (let start = 0; start < 500 && !stop; start += 10) {
        await page.goto(HISTORY(year, start), { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page); pages += 1;
        const cards = await page.$$eval('.order-card, .js-order-card', (cs) => cs.map((c) => ({ text: c.innerText, products: [...c.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]')].map((a) => ({ text: a.innerText || a.getAttribute('title') || '', href: a.getAttribute('href') })) })));
        for (const o of parseCards(cards)) { if (known.has(o.id)) stop = true; else if (!o.date || o.date >= since) out.set(o.id, o); }
        if (cards.length < 10) stop = true;
      }
      if (known.size && stop) break; // daily run: the newest known order reached
    }
    await save(ctx);
  } finally { await ctx.close().catch(() => {}); }
  return { pages, orders: [...out.values()] };
}

async function items(orderIds) { return withLogin(() => readItems(orderIds)); }
async function readItems(orderIds) {
  if (!hasSession()) throw new LoginNeeded();
  const ctx = await context(); const page = await ctx.newPage(); const out = {};
  try {
    for (const id of orderIds.slice(0, 60)) {
      await page.goto(ORDER(id), { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page);
      // Only the bought items: the rest of the page is recommendations ("Kunden kauften auch").
      out[id] = parseItems(await page.$$eval('[data-component="purchasedItems"] a[href*="/dp/"], [data-component="purchasedItems"] a[href*="/gp/product/"], [data-component="shipments"] a[href*="/dp/"]', (as) => as.map((a) => ({ text: a.innerText || a.getAttribute('title') || '', href: a.getAttribute('href') }))));
    }
    await save(ctx);
  } finally { await ctx.close().catch(() => {}); }
  return out;
}

module.exports = { payments, items, orders, extractRows };
