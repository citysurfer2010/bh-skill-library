'use strict';
/** Shared helpers of the finance pages: money, months, API, year chips. Named fin-base so the bundle loads it before the pages. */
window.Fin = (() => {
  const BASE = window.APP_BASE; const esc = (s) => AppShell.esc(s);
  const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const minus = (s) => s.replace(/^-/, '−'); // A real minus sign keeps the digits aligned.
  const euro = (cents) => (cents == null ? '–' : minus(fmt.format(cents / 100)));
  const short = (cents) => (cents ? minus(new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(cents / 100)) : '');
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const tone = (cents) => (cents > 0 ? 'fin-plus' : cents < 0 ? 'fin-minus' : '');
  const amount = (cents) => `<span class="fin-num ${tone(cents)}">${esc(euro(cents))}</span>`;
  const date = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  async function api(method, url, body) {
    const isForm = body instanceof FormData;
    const r = await fetch(`${BASE}/api${url}`, { method, headers: body && !isForm ? { 'content-type': 'application/json' } : {}, body: isForm ? body : body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(data?.error || 'Das hat nicht geklappt'), { status: r.status, code: data?.code });
    return data;
  }

  // The year is part of the address: /finance/2026, /finance/2026/transactions, /finance/all/transactions (15.11.2026).
  const YEAR_PATH = /^\/finance\/(\d{4}|all)(?=\/|$)/;
  const yearParam = () => YEAR_PATH.exec(location.pathname)?.[1] || new URLSearchParams(location.search).get('year') || null;
  const yearOf = () => { const v = yearParam(); return v && v !== 'all' ? Number(v) : null; };
  const allYears = () => yearParam() === 'all';
  const yearHref = (y, page = '') => `${BASE}/${y}${page ? `/${page}` : ''}`;
  const yearChips = (years, year, page = '') => AppShell.chips((years.length ? years : [year]).map((y) => [y, String(y)]), year, (y) => yearHref(y, page));

  function categoryOptions(categories) {
    return [{ value: '', label: 'Noch nicht zugeordnet' }].concat(categories.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, hint: c.art })));
  }

  /** Amazon puts the order number (302-1234567-1234567) into the payment text; it links straight to the order. */
  const amazonOrder = (text) => /\b([0-9D]\d{2}-\d{7}-\d{7})\b/.exec(String(text || ''))?.[1] || null;
  const amazonLink = (text) => {
    const id = /^[0-9D]\d{2}-\d{7}-\d{7}$/.test(String(text || '')) ? text : amazonOrder(text);
    return id ? `<a class="bh-btn bh-btn-sm fin-amazon" href="https://www.amazon.de/gp/your-account/order-details?orderID=${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">Bestellung <span class="fin-num">${esc(id)}</span> ansehen</a>` : '';
  };

  return { amazonOrder, amazonLink, BASE, esc, euro, short, amount, date, MONTHS, api, yearChips, yearOf, allYears, yearHref, categoryOptions, tone };
})();
