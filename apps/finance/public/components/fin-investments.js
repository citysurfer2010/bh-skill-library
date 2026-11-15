'use strict';
/** Investments: what went into shares, savings plans and reserves, per month, per target and over the years. */
window.FinInvestments = (() => {
  const { esc, euro, MONTHS, date } = Fin;

  async function render(host, year) {
    const d = await Fin.api('GET', `/investments?year=${year || ''}`);
    const all = d.perYear.at(-1)?.cumulative || 0;
    const best = d.months.reduce((m, v, i) => (v > d.months[m] ? i : m), 0);
    const max = Math.max(...d.months, 1);
    const bars = `<section class="fin-bars" aria-label="Investiert je Monat ${d.year}">${d.months.map((v, i) => `<div class="fin-bar" tabindex="0" title="${MONTHS[i]}: ${esc(euro(v))}" aria-label="${MONTHS[i]}: ${esc(euro(v))}"><span class="fin-bar-fill" data-h="${Math.round((v / max) * 100)}"></span><span class="fin-bar-label">${MONTHS[i]}</span><span class="fin-bar-value">${v ? esc(Fin.short(v)) : ''}</span></div>`).join('')}</section>`;
    AppShell.render(host, `<header class="app-topbar"><div><h1>Investments und Rücklagen ${d.year}</h1><div class="sub">Geld, das in Anlagen und Rücklagen geflossen ist, etwa Aktien, Beteiligungen und die Rücklagen der Kinder. Rückflüsse zählen negativ.</div></div></header>
      ${Fin.yearChips(d.years, d.year, '/investments')}
      ${AppShell.kpis([{ label: `Angelegt ${d.year}`, value: euro(d.total), sub: `Ø ${euro(Math.round(d.total / 12))} je Monat` }, { label: 'Stärkster Monat', value: d.total ? MONTHS[best] : '–', sub: d.total ? euro(d.months[best]) : '' }, { label: 'Seit Beginn der Daten', value: euro(all) }])}
      ${bars}
      ${AppShell.list({ title: 'Wohin das Geld ging', columns: [{ key: 'counterparty', label: 'Ziel' }, { key: 'cents', label: 'Summe', html: (r) => Fin.amount(r.cents) }, { key: 'category_name', label: 'Kategorie', html: (r) => `${esc(r.category_name || r.category)} <span class="fin-tag">${esc(r.art || '')}</span>` }, { key: 'n', label: 'Buchungen' }, { key: 'last', label: 'Zuletzt', html: (r) => esc(date(r.last)) }], rows: d.targets, empty: 'In diesem Jahr ist nichts investiert worden.' })}
      ${AppShell.list({ title: 'Über die Jahre', columns: [{ key: 'year', label: 'Jahr' }, { key: 'cents', label: 'Angelegt', html: (r) => Fin.amount(r.cents) }, { key: 'cumulative', label: 'Zusammen', html: (r) => Fin.amount(r.cumulative) }], rows: [...d.perYear].reverse(), empty: 'Noch keine Daten.' })}`);
  }

  // Heights via CSSOM: the content security policy forbids style attributes.
  const sizeBars = (host) => host.querySelectorAll('.fin-bar-fill').forEach((b) => b.style.setProperty('--fin-bar-h', `${b.dataset.h}%`));

  return { render: async (host, year) => { await render(host, year); sizeBars(host); } };
})();
