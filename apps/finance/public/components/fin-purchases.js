'use strict';
/**
 * File named fin-purchases so the bundle (alphabetical) loads it after fin-base.js, whose Fin helpers it uses at once.
 * Amazon (15.11.2026): every order with its items and the bank line it was paid with. Search (item, order number)
 * and filters (year, category, with/without bank line) live in the address (?q=, ?year=, ?category=, ?link=).
 */
window.FinPurchases = (() => {
  const { esc, euro, date, BASE } = Fin;
  const KEYS = ['q', 'year', 'category', 'link'];
  let host = null; let cats = []; let years = [];
  const params = () => { const q = new URLSearchParams(location.search); return Object.fromEntries(KEYS.map((k) => [k, q.get(k) || ''])); };

  function itemsCell(o) {
    if (!o.items.length) return '<span class="fin-hint">Artikel noch nicht abgerufen</span>';
    const shown = o.items.slice(0, 3).map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a></li>`).join('');
    return `<ul class="fin-amazon-items">${shown}${o.items.length > 3 ? `<li class="fin-hint">und ${o.items.length - 3} weitere</li>` : ''}</ul>`;
  }
  const lineCell = (o) => (o.transactions.length ? o.transactions.map((t) => `<a href="${BASE}/transactions/${t.id}" class="fin-num">${esc(date(t.booked_on))}</a>`).join('<br>') : '<span class="fin-hint">keine Abbuchung</span>');
  const catCell = (o) => [...new Set(o.transactions.map((t) => t.category_name || 'Zu prüfen'))].map(esc).join(', ') || '–';

  async function draw() {
    const p = params(); const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v));
    const d = await Fin.api('GET', `/amazon/orders?${q}`); years = d.years; const t = d.totals;
    host.querySelector('[data-kpis]').innerHTML = AppShell.kpis([
      { label: 'Bestellungen', value: String(t.orders), sub: `${t.items} Artikel` },
      { label: 'Bezahlt', value: euro(-t.paid), sub: 'laut Abbuchungen' },
      { label: 'Ohne Abbuchung', value: String(t.withoutLine), sub: 'Bestellung ohne passende Bankbuchung' },
    ]);
    host.querySelector('[data-count]').textContent = `${t.orders} Bestellungen`;
    host.querySelector('[data-list]').innerHTML = AppShell.list({ storageKey: 'fin-amazon', className: 'fin-amazon-list', columns: [
      { key: 'day', label: 'Datum', sortValue: (o) => o.day || '', html: (o) => (o.day ? `<span class="fin-num">${esc(date(o.day))}</span>` : '–') },
      { key: 'items', label: 'Artikel', sortValue: (o) => o.items[0]?.title || '', html: itemsCell },
      { key: 'paid_cents', label: 'Betrag', align: 'right', sortValue: (o) => o.paid_cents ?? -(o.total_cents || 0), html: (o) => `<span class="fin-num">${esc(euro(o.paid_cents ?? (o.total_cents == null ? null : -o.total_cents)))}</span>` },
      { key: 'category', label: 'Kategorie', sortValue: catCell, html: catCell },
      { key: 'line', label: 'Abbuchung', sortValue: (o) => o.transactions[0]?.booked_on || '', html: lineCell },
      { key: 'id', label: 'Bestellung', sortable: false, html: (o) => `<a class="fin-num" href="https://www.amazon.de/gp/your-account/order-details?orderID=${encodeURIComponent(o.id)}" target="_blank" rel="noopener noreferrer" aria-label="Bestellung ${esc(o.id)} bei Amazon ansehen">${esc(o.id)} ↗</a>` },
    ], rows: d.orders, empty: 'Keine Bestellung passt zu Suche und Filter.' });
    host.querySelector('[data-reset]').hidden = !KEYS.some((k) => p[k]);
    host.querySelectorAll('[data-filter]').forEach((el) => el.classList.toggle('is-on', !!p[el.dataset.filter]));
  }
  function setParam(key, value) {
    const q = new URLSearchParams(location.search); if (value) q.set(key, value); else q.delete(key);
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`); draw().catch((e) => Toast.error(e.message));
  }

  async function render(h) {
    host = h; const p = params();
    const [c, first] = await Promise.all([Fin.api('GET', '/categories'), Fin.api('GET', '/amazon/orders?year=0000')]);
    cats = c.categories; years = first.years;
    AppShell.render(host, `<header class="app-topbar"><div><h1>Amazon</h1><div class="sub">Alle Bestellungen mit Artikeln und der Abbuchung, mit der sie bezahlt wurden. In den Buchungen findest du sie auch über den Filter „Nur Amazon“.</div></div>
      <div class="app-topbar-actions"><label class="bhlp-search fin-estate-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="search" data-q placeholder="Artikel oder Bestellnummer …" aria-label="Bestellungen suchen" value="${esc(p.q)}"></label></div></header>
      <div data-kpis></div>
      <div class="fin-estate-bar"><strong data-count></strong><div class="fin-filters" role="group" aria-label="Filter"><div class="fin-acc-filter" data-filter="year"></div><div class="fin-acc-filter" data-filter="category"></div><div class="fin-acc-filter" data-filter="link"></div>
      <button type="button" class="bh-btn bh-btn-sm fin-reset" data-reset hidden>Filter zurücksetzen</button></div></div>
      <div data-list></div>`);
    const mount = (key, label, options) => { const el = host.querySelector(`[data-filter="${key}"]`); const pick = BHSelectCore.create(el, { options, value: p[key], label, searchPlaceholder: `${label} suchen …`, onChange: (v) => { pick.update({ value: v }); setParam(key, v); } }); };
    mount('year', 'Jahr', [{ value: '', label: 'Alle Jahre' }].concat(years.map((y) => ({ value: y, label: y }))));
    mount('category', 'Kategorie', [{ value: '', label: 'Alle Kategorien' }, { value: 'OFFEN', label: 'Noch nicht zugeordnet' }].concat(cats.map((x) => ({ value: x.code, label: x.name, hint: x.art }))));
    mount('link', 'Abbuchung', [{ value: '', label: 'Mit und ohne Abbuchung' }, { value: 'mit', label: 'Mit Abbuchung' }, { value: 'ohne', label: 'Ohne Abbuchung' }]);
    let t = null; host.querySelector('[data-q]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => setParam('q', e.target.value.trim()), 250); });
    host.querySelector('[data-reset]').addEventListener('click', () => { history.replaceState(null, '', location.pathname); render(host); });
    await draw();
  }

  return { render };
})();
