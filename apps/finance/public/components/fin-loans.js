'use strict';
/** Loans of the flats: balance, annuity and end from the sheet; interest and repayment per year from the bank lines. */
window.FinLoans = (() => {
  const { esc, euro, date, BASE } = Fin;
  const street = (a) => { const p = String(a).split(',').map((s) => s.trim()); return p.length > 2 ? p.slice(2).join(', ') : a; };
  const city = (a) => String(a).split(',').map((s) => s.trim())[1] || '';
  const monthsTo = (d) => (d ? (Date.parse(`${d}T12:00:00Z`) - Date.now()) / (30.44 * 86_400_000) : Infinity);

  function endCell(l) {
    if (!l.ends_on) return '–';
    const m = monthsTo(l.ends_on);
    const tag = m < 0 ? '<span class="fin-badge fin-badge-warn">abgelaufen</span>' : m <= 18 ? '<span class="fin-badge fin-badge-warn">bald</span>' : '';
    return `<span class="fin-num">${esc(date(l.ends_on))}</span> ${tag}`;
  }

  /** Year-end balances from the bank's statements, one row per year and a column per loan that has them. */
  function history(loans) {
    const withH = loans.filter((l) => l.history?.length); if (!withH.length) return '';
    const years = [...new Set(withH.flatMap((l) => l.history.map((h) => h.on.slice(0, 4))))].sort().reverse();
    const at = (l, y) => [...l.history].reverse().find((h) => h.on.slice(0, 4) === y);
    return AppShell.list({ title: 'Restschuld laut Bank (Jahresende)', className: 'fin-years-list', columns: [{ key: 'year', label: 'Jahr' }]
      .concat(withH.map((l, i) => ({ key: `l${i}`, label: `${street(l.address)} · ${l.unit}`, align: 'right', html: (r) => { const h = at(l, r.year); return h ? `<span class="fin-num">${esc(euro(h.cents))}</span>` : '–'; } }))),
    rows: years.map((year) => ({ year })) });
  }

  async function render(host) {
    const d = await Fin.api('GET', '/loans');
    const Y = new Date().getFullYear(); const yv = (l, k) => l.years[Y]?.[k] || 0;
    const soon = d.loans.filter((l) => monthsTo(l.ends_on) <= 18).length;
    const ltv = d.totals.marketValue ? Math.round((d.totals.balance / d.totals.marketValue) * 100) : null;
    const lastYear = d.years.find((y) => y.year === Y - 1);
    AppShell.render(host, `<header class="app-topbar"><div><h1>Kredite</h1><div class="sub">Darlehen der Wohnungen. Betrag, Rate und Laufzeit aus der Portfolioübersicht${d.asOf ? ` (Stand ${esc(date(d.asOf))})` : ''}; Restschuld laut Bank, wo Kontoauszüge vorliegen; Zins und Tilgung aus den Bankbuchungen.</div></div></header>
      ${AppShell.kpis([
    { label: 'Restschuld', value: euro(d.totals.balance), sub: `${d.loans.length} Darlehen, aufgenommen ${euro(d.totals.amount)}` },
    { label: 'Rate je Monat', value: euro(d.totals.annuity), sub: `${euro(d.totals.annuity * 12)} im Jahr` },
    { label: 'Beleihung', value: ltv == null ? '–' : `${ltv} %`, sub: 'Restschuld zum Marktwert der finanzierten Wohnungen' },
    { label: `Zinsen ${Y - 1}`, value: lastYear ? euro(lastYear.interest) : '–', sub: lastYear ? `Tilgung ${euro(lastYear.principal)}` : 'keine Bankdaten' },
  ])}
      ${soon ? `<p class="fin-hint fin-loans-soon">${soon === 1 ? '1 Darlehen läuft in den nächsten 18 Monaten aus oder ist schon ausgelaufen' : `${soon} Darlehen laufen in den nächsten 18 Monaten aus oder sind schon ausgelaufen`}: Anschlussfinanzierung rechtzeitig klären.</p>` : ''}
      ${AppShell.list({ storageKey: 'fin-loans', className: 'fin-loan-list', columns: [
    { key: 'address', label: 'Wohnung', sortValue: (l) => `${street(l.address)} ${l.unit}`, html: (l) => `<strong class="fin-nowrap">${esc(street(l.address))} · ${esc(l.unit)}</strong><div class="fin-hint">${esc(city(l.address))}${l.owner ? ` · ${esc(l.owner)}` : ''}${l.position > 1 ? ` · ${l.position}. Darlehen` : ''}</div>` },
    { key: 'lender', label: 'Darlehensgeber', html: (l) => `${esc(l.lender || '–')}${l.iban ? ` <span class="fin-tag" title="Darlehenskonto">${esc(l.iban)}</span>` : ''}` },
    { key: 'balance_cents', label: 'Restschuld', align: 'right', sortValue: (l) => l.balance_now_cents ?? -1, html: (l) => `<span class="fin-num">${esc(euro(l.balance_now_cents))}</span>${l.bank_balance ? `<div class="fin-hint" title="Kontoauszug vom ${esc(date(l.bank_balance.on))} minus Tilgung der Raten seitdem">Bank ${esc(date(l.bank_balance.on))} − Tilgung</div>` : ''}${l.shared_units?.length ? `<div class="fin-hint" title="Ein Darlehen für mehrere Wohnungen; in der Wohnungsliste nach Marktwert aufgeteilt">gemeinsam für ${esc(l.shared_units.map((k) => k.split('–').pop().trim()).join(' und '))}</div>` : ''}${l.shared ? `<div class="fin-hint" title="Ein Darlehenskonto für ${l.shared} Wohnungen, aufgeteilt nach der Restschuld laut Portfolioübersicht">Anteil, 1 Darlehen für ${l.shared} Wohnungen</div>` : ''}<div class="fin-hint">von ${esc(euro(l.amount_cents))}</div>` },
    { key: 'annuity_cents', label: 'Rate', align: 'right', sortValue: (l) => l.annuity_cents ?? -1, html: (l) => `<span class="fin-num">${esc(euro(l.annuity_cents))}</span>${l.rate_pct != null ? `<div class="fin-hint" title="${l.rate_source === 'bank' ? 'laut Kontoauszug der Bank' : 'laut Portfolioübersicht'}">${esc(l.rate_pct.toLocaleString('de-DE'))} % Zins${l.rate_source === 'sheet' ? ' (Sheet)' : ''}</div>` : ''}` },
    { key: 'ends_on', label: 'Läuft bis', sortValue: (l) => l.ends_on || '9999', html: endCell },
    { key: 'interest', label: `Zins ${Y} bisher`, align: 'right', sortValue: (l) => yv(l, 'interest'), html: (l) => (l.years[Y] ? `<span class="fin-mob-label">Zins ${Y} </span><span class="fin-num">${esc(euro(yv(l, 'interest')))}</span><div class="fin-hint">${esc(euro(yv(l, 'principal')))} Tilgung</div>` : '<span class="fin-hint">keine Buchung</span>') },
    { key: 'link', label: 'Buchungen', srOnly: true, sortable: false, html: (l) => [l.ref && Object.keys(l.years).length ? `<a href="${BASE}/all/transactions?scope=all&amp;q=${encodeURIComponent(l.ref)}" aria-label="Buchungen zum Darlehen ${esc(street(l.address))} ${esc(l.unit)}">Buchungen</a>` : '',
      l.docs_url ? `<a href="${esc(l.docs_url)}" target="_blank" rel="noopener noreferrer" aria-label="Unterlagen zum Darlehen ${esc(street(l.address))} ${esc(l.unit)} (Google Drive)">Unterlagen</a>` : ''].filter(Boolean).join('<br>') },
  ], rows: d.loans, empty: 'Noch keine Kredite. Sie kommen aus der Portfolioübersicht (scripts/import-portfolio.js).' })}
      ${d.years.length ? AppShell.list({ title: 'Über die Jahre (aus den Bankbuchungen)', className: 'fin-years-list', columns: [
    { key: 'year', label: 'Jahr' },
    { key: 'interest', label: 'Zinsen', align: 'right', html: (r) => `<span class="fin-num">${esc(euro(r.interest))}</span>` },
    { key: 'principal', label: 'Tilgung', align: 'right', html: (r) => `<span class="fin-num">${esc(euro(r.principal))}</span>` },
    { key: 'paid', label: 'Gezahlt', align: 'right', html: (r) => `<span class="fin-num">${esc(euro(r.paid))}</span>` },
  ], rows: d.years }) : ''}
      ${history(d.loans)}
      ${d.unmatched ? `<p class="fin-hint">${d.unmatched} Darlehensbuchungen gehören zu keinem Darlehen aus der Tabelle (z. B. abgelöste Darlehen oder fehlendes Darlehenskonto).</p>` : ''}`);
  }

  return { render };
})();
