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

  const yearChips = (years, year, path) => AppShell.chips((years.length ? years : [year]).map((y) => [y, String(y)]), year, (y) => `${BASE}${path}?year=${y}`);
  const yearOf = () => Number(new URLSearchParams(location.search).get('year')) || null;

  function categoryOptions(categories) {
    return [{ value: '', label: 'Noch nicht zugeordnet' }].concat(categories.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, hint: c.art })));
  }

  return { BASE, esc, euro, short, amount, date, MONTHS, api, yearChips, yearOf, categoryOptions, tone };
})();
