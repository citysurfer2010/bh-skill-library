'use strict';
/** Overview: key figures and the month-by-month table per kind and category, like the old dashboard. */
window.FinOverview = (() => {
  const { esc, euro, short, MONTHS, BASE } = Fin;
  const ORDER = ['Einnahmen', 'Ausgaben', 'Investment', 'Rücklagen', 'Übertrag', 'Auslagen', 'Offen', 'Unbekannt'];

  function rowsOf(data) {
    const out = [];
    for (const art of [...data.arts].sort((a, b) => ORDER.indexOf(a.art) - ORDER.indexOf(b.art))) {
      out.push({ head: true, name: art.art, months: art.months, total: art.total, previous: art.previous || null, budget: null });
      for (const c of data.categories.filter((x) => x.art === art.art).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))) {
        out.push({ code: c.code, name: c.name, months: c.months, total: c.total, previous: c.previous, budget: c.budget_cents });
      }
    }
    return out;
  }

  function table(data) {
    const link = (r) => (r.head ? `<strong class="fin-group">${esc(r.name)}</strong>` : `<a href="${BASE}/transactions?year=${data.year}&category=${encodeURIComponent(r.code)}">${esc(r.name)}</a>`);
    const cell = (v) => `<span class="fin-num ${Fin.tone(v)}">${esc(short(v))}</span>`;
    // Average spending above the budget is marked; budgets are positive, spending negative.
    const avg = (r) => { const a = Math.round(r.total / 12); const over = r.budget != null && -a > r.budget; return `<span class="fin-num ${over ? 'fin-over' : Fin.tone(a)}"${over ? ' title="Über dem Budget"' : ''}>${esc(short(a))}${over ? ' ▲' : ''}</span>`; };
    const columns = [
      { key: 'name', label: 'Kategorie', html: link },
      { key: 'total', label: 'Summe', html: (r) => `<strong>${cell(r.total)}</strong>` },
      { key: 'avg', label: 'Ø/Mon.', html: avg },
      { key: 'budget', label: 'Budget', html: (r) => (r.budget == null ? '' : cell(-r.budget)) },
      { key: 'previous', label: `Vorjahr ${data.year - 1}`, html: (r) => (r.previous == null ? '' : `<span class="fin-prev">${cell(r.previous)}</span>`) },
    ].concat(MONTHS.map((m, i) => ({ key: `m${i}`, label: m, html: (r) => cell(r.months[i]) })));
    return `<div class="fin-matrix">${AppShell.list({ columns, rows: rowsOf(data), empty: 'Für dieses Jahr gibt es noch keine Buchungen.' })}</div>
      <p class="fin-hint">Eingänge grün, Ausgänge mit −. ▲ heißt: Der Monatsdurchschnitt liegt über dem Budget. Die Monate stehen rechts, auf dem Handy seitlich wischen.</p>`;
  }

  async function render(host, year) {
    const data = await Fin.api('GET', `/overview?year=${year || ''}`);
    const t = data.totals;
    const prev = (art) => { const a = data.arts.find((x) => x.art === art); return a?.previous ? `${data.year - 1}: ${euro(a.previous)}` : 'Summe des Jahres'; };
    const kpis = AppShell.kpis([
      { label: 'Einnahmen', value: euro(t.income), sub: prev('Einnahmen') },
      { label: 'Ausgaben', value: euro(t.spending), sub: prev('Ausgaben') },
      { label: 'Überschuss', value: euro(t.result), sub: t.result < 0 ? 'Mehr ausgegeben als eingenommen' : 'Einnahmen minus Ausgaben' },
      { label: 'Investiert und zurückgelegt', value: euro(t.invested + t.reserved), sub: t.savingsRate == null ? '' : `Sparquote ${t.savingsRate.toLocaleString('de-DE')} %` },
    ]);
    const open = t.open ? `<div class="fin-callout"><span>${t.open} Buchungen sind noch nicht zugeordnet und fehlen in den Summen ihrer Kategorie.</span><a class="bh-btn bh-btn-primary bh-btn-sm" href="${BASE}/transactions?year=${data.year}&category=OFFEN">Jetzt zuordnen</a></div>` : '';
    AppShell.render(host, `<header class="app-topbar"><div><h1>Übersicht ${data.year}</h1><div class="sub">Alle Konten, Beträge in Euro. Klick auf eine Kategorie zeigt ihre Buchungen.</div></div></header>
      ${Fin.yearChips(data.years, data.year, '/')}${kpis}${open}${table(data)}`);
  }

  return { render };
})();
