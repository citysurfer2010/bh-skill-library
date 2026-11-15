'use strict';
/** Reads "Ihre Zahlungen → Transaktionen" back to a date, and the items of single orders. Slow on purpose: one page at a time. */
const { context, save, hasSession, forget, LoginNeeded } = require('./session');
const { parsePayments, parseItems } = require('./parse');

const PAYMENTS = 'https://www.amazon.de/cpe/yourpayments/transactions';
const ORDER = (id) => `https://www.amazon.de/gp/your-account/order-details?orderID=${encodeURIComponent(id)}`;
const MAX_PAGES = 300;
const pause = (page) => page.waitForTimeout(1200 + Math.floor(Math.random() * 800));

/** Runs in the page: each element holding an order number, widened to the row that also shows an amount, plus the date heading above it. */
function extractRows() {
  const ID = /\d{3}-\d{7}-\d{7}/; const DATE = /^\s*\d{1,2}\.\s*[A-Za-zäÄ]+\s+\d{4}\s*$/;
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

async function guard(page) { if (/\/ap\/signin|\/ap\/mfa/.test(page.url())) { forget(); throw new LoginNeeded(); } }

async function payments({ since = '2021-01-01' } = {}) {
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

async function items(orderIds) {
  if (!hasSession()) throw new LoginNeeded();
  const ctx = await context(); const page = await ctx.newPage(); const out = {};
  try {
    for (const id of orderIds.slice(0, 60)) {
      await page.goto(ORDER(id), { waitUntil: 'domcontentloaded', timeout: 60_000 }); await guard(page); await pause(page);
      out[id] = parseItems(await page.$$eval('a[href*="/dp/"], a[href*="/gp/product/"]', (as) => as.map((a) => ({ text: a.innerText || a.getAttribute('title') || '', href: a.getAttribute('href') }))));
    }
    await save(ctx);
  } finally { await ctx.close().catch(() => {}); }
  return out;
}

module.exports = { payments, items, extractRows };
