'use strict';
/** Module Immobilien: the flats with value, rent and loans (Matti 15.11.2026). Loans themselves live under Finanzen → Kredite. */
window.FinEstate = (() => {
  const { esc, euro, date, BASE } = Fin;
  const street = (a) => { const p = String(a).split(',').map((s) => s.trim()); return p.length > 2 ? p.slice(2).join(', ') : a; };
  const city = (a) => String(a).split(',').map((s) => s.trim())[1] || '';
  const pct = (a, b) => (a && b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('de-DE')} %` : '–');

  async function render(host) {
    const d = await Fin.api('GET', '/estate'); const t = d.totals;
    AppShell.render(host, `<header class="app-topbar"><div><h1>Wohnungen</h1><div class="sub">Aus der Portfolioübersicht${d.asOf ? ` (Stand ${esc(date(d.asOf))})` : ''}. Die Darlehen stehen unter <a href="${BASE}/loans">Finanzen → Kredite</a>.</div></div></header>
      ${AppShell.kpis([
    { label: 'Wohnungen', value: String(t.units), sub: t.sqm ? `${Math.round(t.sqm).toLocaleString('de-DE')} m²` : '' },
    { label: 'Marktwert', value: euro(t.marketValue), sub: t.sqm ? `${euro(Math.round(t.marketValue / t.sqm))} je m²` : '' },
    { label: 'Kaltmiete im Jahr', value: euro(t.rentYear), sub: `Bruttorendite ${pct(t.rentYear, t.marketValue)}` },
    { label: 'Beleihung', value: pct(t.balance, t.marketValue), sub: `Restschuld ${euro(t.balance)}` },
  ])}
      ${AppShell.list({ storageKey: 'fin-estate', className: 'fin-estate-list', columns: [
    { key: 'address', label: 'Wohnung', sortValue: (u) => `${street(u.address)} ${u.unit}`, html: (u) => `<strong class="fin-nowrap">${esc(street(u.address))} · ${esc(u.unit)}</strong><div class="fin-hint">${esc(city(u.address))}${u.floor ? ` · ${esc(u.floor)}` : ''}</div>` },
    { key: 'owner', label: 'Eigentümer' },
    { key: 'sqm', label: 'Fläche', align: 'right', sortValue: (u) => u.sqm ?? -1, html: (u) => (u.sqm ? `<span class="fin-num">${esc(u.sqm.toLocaleString('de-DE', { maximumFractionDigits: 1 }))} m²</span>` : '–') },
    { key: 'market_value_cents', label: 'Marktwert', align: 'right', sortValue: (u) => u.market_value_cents ?? -1, html: (u) => `<span class="fin-num">${esc(euro(u.market_value_cents))}</span>` },
    { key: 'rent_year_cents', label: 'Kaltmiete p. M.', align: 'right', sortValue: (u) => u.rent_year_cents ?? -1, html: (u) => (u.rent_year_cents ? `<span class="fin-num">${esc(euro(Math.round(u.rent_year_cents / 12)))}</span><div class="fin-hint">Rendite ${pct(u.rent_year_cents, u.market_value_cents)}</div>` : '–') },
    { key: 'balance_cents', label: 'Restschuld', align: 'right', sortValue: (u) => u.balance_cents ?? -1, html: (u) => (u.loans ? `<a class="fin-num" href="${BASE}/loans">${esc(euro(u.balance_cents))}</a><div class="fin-hint">Beleihung ${pct(u.balance_cents, u.market_value_cents)}</div>` : '<span class="fin-hint">schuldenfrei</span>') },
  ], rows: d.units, empty: 'Noch keine Wohnungen. Sie kommen aus der Portfolioübersicht (scripts/import-portfolio.js).' })}`);
  }

  return { render };
})();
