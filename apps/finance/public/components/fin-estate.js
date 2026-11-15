'use strict';
/**
 * Module Immobilien: the flats with value, rent and loans (Matti 15.11.2026). Loans themselves live under Finanzen → Kredite.
 * Search (address, flat, owner) and filters (owner, city, financing) live in the address (?q=, ?owner=, ?city=, ?debt=)
 * so every view can be shared; a set filter is highlighted, the KPIs count the flats shown.
 */
window.FinEstate = (() => {
  const { esc, euro, date, BASE } = Fin;
  const street = (a) => { const p = String(a).split(',').map((s) => s.trim()); return p.length > 2 ? p.slice(2).join(', ') : a; };
  const city = (a) => String(a).split(',').map((s) => s.trim())[1] || '';
  const pct = (a, b) => (b > 0 ? `${(Math.round(((a || 0) / b) * 1000) / 10).toLocaleString('de-DE')} %` : '–');
  const area = (v) => `${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
  const KEYS = ['q', 'owner', 'city', 'debt'];
  let units = []; let host = null;

  const params = () => { const q = new URLSearchParams(location.search); return Object.fromEntries(KEYS.map((k) => [k, q.get(k) || ''])); };
  function setParam(key, value) {
    const q = new URLSearchParams(location.search); if (value) q.set(key, value); else q.delete(key);
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`); draw();
  }
  function shown() {
    const p = params(); const words = p.q.toLowerCase().split(/\s+/).filter(Boolean);
    return units.filter((u) => (!p.owner || u.owner === p.owner) && (!p.city || city(u.address) === p.city)
      && (!p.debt || (p.debt === 'mit' ? u.loans > 0 : !u.loans))
      && words.every((w) => `${u.address} ${u.unit} ${u.floor} ${u.owner}`.toLowerCase().includes(w)));
  }

  function kpis(list) {
    const sum = (k) => list.reduce((s, u) => s + (u[k] || 0), 0); const sqm = sum('sqm'); const value = sum('market_value_cents'); const rent = sum('rent_year_cents'); const debt = sum('balance_cents');
    return AppShell.kpis([
      { label: 'Wohnungen', value: String(list.length), sub: sqm ? area(sqm) : '' },
      { label: 'Marktwert', value: euro(value), sub: sqm ? `${euro(Math.round(value / sqm))} je m²` : '' },
      { label: 'Kaltmiete im Jahr', value: euro(rent), sub: `Bruttorendite ${pct(rent, value)}` },
      { label: 'Beleihung', value: pct(debt, value), sub: `Restschuld ${euro(debt)}` },
    ]);
  }

  function table(list) {
    return AppShell.list({ storageKey: 'fin-estate', className: 'fin-estate-list', columns: [
      { key: 'address', label: 'Wohnung', sortValue: (u) => `${street(u.address)} ${u.unit}`, html: (u) => `<strong><span class="fin-nowrap">${esc(street(u.address))}</span> · <span class="fin-nowrap">${esc(u.unit)}</span></strong><div class="fin-hint">${esc(city(u.address))}${u.floor ? ` · ${esc(u.floor)}` : ''}</div>` },
      { key: 'owner', label: 'Eigentümer', html: (u) => `<span class="fin-mob-label">Eigentümer </span>${esc(u.owner || '–')}` },
      { key: 'sqm', label: 'Fläche', align: 'right', sortValue: (u) => u.sqm ?? -1, html: (u) => (u.sqm ? `<span class="fin-num">${esc(area(u.sqm))}</span>` : '–') },
      { key: 'market_value_cents', label: 'Marktwert', align: 'right', sortValue: (u) => u.market_value_cents ?? -1, html: (u) => `<span class="fin-num">${esc(euro(u.market_value_cents))}</span>` },
      { key: 'rent_year_cents', label: 'Kaltmiete p. M.', align: 'right', sortValue: (u) => u.rent_year_cents ?? -1, html: (u) => (u.rent_year_cents ? `<span class="fin-num">${esc(euro(Math.round(u.rent_year_cents / 12)))}</span><div class="fin-hint">Rendite ${pct(u.rent_year_cents, u.market_value_cents)}</div>` : '–') },
      { key: 'balance_cents', label: 'Restschuld', align: 'right', sortValue: (u) => u.balance_cents ?? -1, html: (u) => (u.loans ? `<a class="fin-num" href="${BASE}/loans">${esc(euro(u.balance_cents))}</a><div class="fin-hint">Beleihung ${pct(u.balance_cents, u.market_value_cents)}</div>` : '<span class="fin-hint">schuldenfrei</span>') },
      { key: 'links', label: 'Ordner', srOnly: true, sortable: false, html: (u) => (u.folder_url ? `<a href="${esc(u.folder_url)}" target="_blank" rel="noopener noreferrer" aria-label="Drive-Ordner ${esc(street(u.address))} ${esc(u.unit)} (Google Drive)">Ordner</a>` : '') },
    ], rows: list, empty: units.length ? 'Keine Wohnung passt zu Suche und Filter.' : 'Noch keine Wohnungen. Sie kommen aus der Portfolioübersicht (scripts/import-portfolio.js).' });
  }

  /** KPIs, count and list follow the filters; the filter bar itself stays, so focus and typing are not lost. */
  function draw() {
    const list = shown(); const p = params();
    host.querySelector('[data-kpis]').innerHTML = kpis(list);
    host.querySelector('[data-list]').innerHTML = table(list);
    host.querySelector('[data-count]').textContent = `${list.length} von ${units.length} Wohnungen`;
    host.querySelector('[data-reset]').hidden = !KEYS.some((k) => p[k]);
    host.querySelectorAll('[data-filter]').forEach((el) => el.classList.toggle('is-on', !!p[el.dataset.filter]));
  }

  async function render(h) {
    host = h; const d = await Fin.api('GET', '/estate'); units = d.units; const p = params();
    AppShell.render(host, `<header class="app-topbar"><div><h1>Wohnungen</h1><div class="sub">Aus der Portfolioübersicht${d.asOf ? ` (Stand ${esc(date(d.asOf))})` : ''}. Die Darlehen stehen unter <a href="${BASE}/loans">Finanzen → Kredite</a>.</div></div>
      <div class="app-topbar-actions"><label class="bhlp-search fin-estate-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="search" data-q placeholder="Adresse, WE, Eigentümer …" aria-label="Wohnungen suchen" value="${esc(p.q)}"></label></div></header>
      <div data-kpis></div>
      <div class="fin-estate-bar"><strong data-count></strong><div class="fin-filters" role="group" aria-label="Filter"><div class="fin-acc-filter" data-filter="owner"></div><div class="fin-acc-filter" data-filter="city"></div><div class="fin-acc-filter" data-filter="debt"></div>
      <button type="button" class="bh-btn bh-btn-sm fin-reset" data-reset hidden>Filter zurücksetzen</button></div></div>
      <div data-list></div>`);
    const uniq = (f) => [...new Set(units.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    const mount = (key, label, options) => { const el = host.querySelector(`[data-filter="${key}"]`); const pick = BHSelectCore.create(el, { options, value: p[key], label, searchPlaceholder: `${label} suchen …`, onChange: (v) => { pick.update({ value: v }); setParam(key, v); } }); };
    mount('owner', 'Eigentümer', [{ value: '', label: 'Alle Eigentümer' }].concat(uniq((u) => u.owner).map((o) => ({ value: o, label: o }))));
    mount('city', 'Ort', [{ value: '', label: 'Alle Orte' }].concat(uniq((u) => city(u.address)).map((c) => ({ value: c, label: c }))));
    mount('debt', 'Finanzierung', [{ value: '', label: 'Mit und ohne Darlehen' }, { value: 'mit', label: 'Mit Darlehen' }, { value: 'ohne', label: 'Schuldenfrei' }]);
    let t = null; host.querySelector('[data-q]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => setParam('q', e.target.value.trim()), 200); });
    host.querySelector('[data-reset]').addEventListener('click', () => { history.replaceState(null, '', location.pathname); render(host); });
    draw();
  }

  return { render };
})();
