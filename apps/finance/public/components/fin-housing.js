'use strict';
/**
 * Wohnkosten (Matti 22.11.2026): the rented home per year (rent, Nebenkostenabrechnung, energy, broadcast fee) and an
 * estimate for the running year. One series (cost per month), the estimate bar hatched; the parts are in the table.
 * The expected settlement of the running year can be entered in a dialog; otherwise the average past one counts.
 */
window.FinHousing = (() => {
  const { esc, euro, date } = Fin;
  const amt = (c) => `<span class="fin-num">${esc(euro(c))}</span>`;

  function bars(d) {
    const rows = d.years.filter((y) => y.year < d.thisYear).map((y) => ({ label: String(y.year), v: -y.perMonth, est: false }));
    if (d.estimate) rows.push({ label: `${d.thisYear}*`, v: -d.estimate.perMonth, est: true });
    const max = Math.max(...rows.map((r) => r.v), 1);
    return `<section class="fin-bars fin-years-bars" data-n="${rows.length}" aria-label="Wohnkosten je Monat nach Jahr">${rows.map((r) => `<div class="fin-bar" tabindex="0" title="${esc(r.label)}: ${esc(euro(-r.v))} je Monat${r.est ? ' (Schätzung)' : ''}" aria-label="${esc(r.label)}: ${esc(euro(-r.v))} je Monat${r.est ? ', Schätzung' : ''}"><span class="fin-bar-fill${r.est ? ' is-estimate' : ''}" data-h="${Math.round((r.v / max) * 100)}"></span><span class="fin-bar-label">${esc(r.label)}</span><span class="fin-bar-value">${esc(Fin.short(r.v))}</span></div>`).join('')}</section>`;
  }

  function table(d) {
    const rows = d.years.filter((y) => y.year < d.thisYear).map((y) => ({ ...y, label: String(y.year) }));
    const cur = d.years.find((y) => y.year === d.thisYear);
    if (cur) rows.push({ ...cur, label: `${d.thisYear} bisher`, perMonth: null });
    if (d.estimate) rows.push({ ...d.estimate, label: `${d.thisYear} Schätzung`, furnishing: null, est: true });
    return AppShell.list({ title: 'Je Jahr', className: 'fin-housing-list', columns: [
      { key: 'label', label: 'Jahr', html: (r) => (r.est ? `<strong>${esc(r.label)}</strong>` : esc(r.label)) },
      { key: 'rent', label: 'Miete', align: 'right', html: (r) => amt(r.rent) },
      { key: 'settlement', label: 'Nebenkosten-Abrechnung', align: 'right', html: (r) => (r.settlement ? amt(r.settlement) : '–') },
      { key: 'energy', label: 'Strom/Energie', align: 'right', html: (r) => amt(r.energy) },
      { key: 'broadcast', label: 'Rundfunk', align: 'right', html: (r) => amt(r.broadcast) },
      { key: 'total', label: 'Summe', align: 'right', html: (r) => `<strong>${amt(r.total)}</strong>` },
      { key: 'perMonth', label: 'je Monat', align: 'right', html: (r) => (r.perMonth == null ? '–' : amt(r.perMonth)) },
    ], rows, empty: 'Noch keine Buchungen unter „Wohnung“.' });
  }

  function settleDialog(d, host) {
    const e = d.estimate; const now = e?.settlementEntered;
    let kind = now != null && now > 0 ? 'refund' : 'back';
    BHModal.open({
      title: `Nebenkostenabrechnung ${d.thisYear}`, submitLabel: 'Speichern', busyLabel: 'Speichern …',
      body: `<p class="fin-hint">Was die Abrechnung voraussichtlich bringt. Ohne Eintrag rechnet die Schätzung mit dem Schnitt der letzten Abrechnungen (${esc(euro(e?.settlementAverage || 0))}). Sobald die Zahlung gebucht ist, zählt sie.</p>
        <span class="bh-label">Art</span><div id="fin-nka-kind"></div>
        <label class="bh-label" for="fin-nka-amount">Betrag in €</label><input id="fin-nka-amount" class="bh-input" name="amount" type="number" min="0" step="1" inputmode="decimal" required value="${now != null ? Math.abs(now) / 100 : ''}" placeholder="z. B. 1500">`,
      onOpen: (dlg) => { const pick = BHSelectCore.create(dlg.querySelector('#fin-nka-kind'), { options: [{ value: 'back', label: 'Nachzahlung' }, { value: 'refund', label: 'Erstattung' }], value: kind, label: 'Art', searchable: false, onChange: (v) => { kind = v; pick.update({ value: v }); } }); },
      onSubmit: async (form) => {
        const v = Number(form.elements.amount.value); if (!(v >= 0)) throw new Error('Bitte einen Betrag eingeben.');
        await Fin.api('PUT', '/housing/settlement', { year: d.thisYear, cents: Math.round(v * 100) * (kind === 'back' ? -1 : 1) });
        Toast.success('Gespeichert'); render(host);
      },
    });
  }

  async function render(host) {
    const d = await Fin.api('GET', '/housing'); const e = d.estimate;
    const prev = d.years.find((y) => y.year === d.thisYear - 1);
    const change = e && prev?.total ? Math.round(((Math.abs(e.total) - Math.abs(prev.total)) / Math.abs(prev.total)) * 1000) / 10 : null; // costs are negative: more cost = positive change
    const pastSettle = d.settlements.filter((s) => Number(s.on.slice(0, 4)) < d.thisYear);
    const avgSettle = pastSettle.length ? Math.round(pastSettle.reduce((s, x) => s + x.cents, 0) / pastSettle.length) : null;
    AppShell.render(host, `<header class="app-topbar"><div><h1>Wohnkosten</h1><div class="sub">Eure Mietwohnung${d.landlord ? ` (Miete an ${esc(d.landlord)})` : ''}: Miete, Nebenkostenabrechnung, Strom/Energie und Rundfunk aus den Privatkonten. ${d.thisYear} ist hochgerechnet (*).</div></div>
      <div class="app-topbar-actions">${e ? `<button type="button" class="bh-btn" data-nka>Abrechnung ${d.thisYear} eintragen</button>` : ''}</div></header>
      ${AppShell.kpis([
    { label: `Wohnkosten ${d.thisYear} (Schätzung)`, value: e ? `${euro(-e.perMonth)} / Monat` : '–', sub: e ? `${euro(-e.total)} im Jahr` : '' },
    { label: `Veränderung zu ${d.thisYear - 1}`, value: change == null ? '–' : `${change > 0 ? '+' : ''}${change.toLocaleString('de-DE')} %`, sub: prev ? `${d.thisYear - 1}: ${euro(-prev.perMonth)} / Monat` : '' },
    { label: 'Miete aktuell', value: d.rentNow ? `${euro(-d.rentNow)} / Monat` : '–', sub: 'inkl. Nebenkosten-Vorauszahlung' },
    { label: 'Nebenkostenabrechnung Ø', value: avgSettle == null ? '–' : euro(avgSettle), sub: avgSettle && avgSettle < 0 ? `Vorauszahlung rund ${euro(Math.round(-avgSettle / 12))} / Monat zu niedrig` : `${pastSettle.length} Abrechnungen` },
  ])}
      ${bars(d)}
      ${e ? `<p class="fin-hint">* Schätzung ${d.thisYear}: Miete für die restlichen ${e.rentLeftMonths} Monate zum aktuellen Betrag, Strom nach dem Schnitt der letzten 12 Monate, Nebenkostenabrechnung ${esc(e.settlementSource)} (${esc(euro(e.settlement))}).</p>` : ''}
      ${table(d)}
      ${d.years.some((y) => y.furnishing) ? `<p class="fin-hint">Nicht enthalten, weil keine laufenden Kosten: Einrichtung und Baumarkt unter „Wohnung“ (${d.years.filter((y) => y.furnishing).map((y) => `${y.year}: ${esc(euro(y.furnishing))}`).join(', ')}).</p>` : ''}
      <div data-rentbuy></div>
      ${d.settlements.length ? AppShell.list({ title: 'Abrechnungen (Nachzahlungen und Erstattungen)', columns: [{ key: 'on', label: 'Gezahlt am', html: (s) => `<span class="fin-num">${esc(date(s.on))}</span>` }, { key: 'cents', label: 'Betrag', align: 'right', html: (s) => amt(s.cents) }], rows: [...d.settlements].reverse() }) : ''}`);
    host.querySelectorAll('.fin-years-bars').forEach((b) => b.style.setProperty('--fin-n', b.dataset.n));
    host.querySelectorAll('.fin-bar-fill').forEach((b) => b.style.setProperty('--fin-bar-h', `${b.dataset.h}%`));
    FinRentBuy.render(host.querySelector('[data-rentbuy]'), d);
    host.querySelector('[data-nka]')?.addEventListener('click', () => settleDialog(d, host));
  }

  return { render };
})();
