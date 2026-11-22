'use strict';
/**
 * Vermögen (22.11.2026): net worth today and per month end: flats at market value minus the loans' balance, the
 * accounts (private and the flats'), depot and other assets entered here. One series (net worth) as a line; the parts
 * per month in the table. Values the banks do not report are entered in a dialog, each entry a point in time.
 */
window.FinWealth = (() => {
  const { esc, euro, date } = Fin;
  const amt = (c) => `<span class="fin-num">${esc(euro(c))}</span>`;
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const label = (on) => `${MONTHS[Number(on.slice(5, 7)) - 1]} ${on.slice(2, 4)}`;

  /** One series over time: a 2px line with markers (hover shows the value), y from just below the minimum. */
  function line(months) {
    const rows = months.slice(-36); if (rows.length < 2) return '';
    const W = 720; const H = 220; const L = 88; const B = 26; const vals = rows.map((m) => m.net);
    let lo = Math.min(...vals); let hi = Math.max(...vals); const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.002, 10000); lo -= pad; hi += pad;
    const x = (i) => L + (i * (W - L - 36)) / (rows.length - 1); const y = (v) => 8 + (H - B - 8) * (1 - (v - lo) / (hi - lo));
    const pts = rows.map((m, i) => `${x(i).toFixed(1)},${y(m.net).toFixed(1)}`).join(' ');
    const ticks = [hi - pad, (hi + lo) / 2, lo + pad].map((v) => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="fin-axis">${esc(Fin.short(Math.round(v)))}</text><line x1="${L}" x2="${W - 24}" y1="${y(v)}" y2="${y(v)}" class="fin-grid"/>`).join('');
    const xl = rows.map((m, i) => (i % 3 === 0 || i === rows.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="fin-axis">${esc(label(m.on))}</text>` : '')).join('');
    const dots = rows.map((m, i) => `<g class="fin-pt" tabindex="0"><circle cx="${x(i)}" cy="${y(m.net)}" r="10" class="fin-hit"/><circle cx="${x(i)}" cy="${y(m.net)}" r="4" class="fin-dot"/><title>${esc(label(m.on))}: ${esc(euro(m.net))}</title></g>`).join('');
    return `<figure class="fin-wealth-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Nettovermögen je Monatsende, von ${esc(euro(rows[0].net))} auf ${esc(euro(rows.at(-1).net))}">${ticks}${xl}<polyline points="${pts}" class="fin-line"/>${dots}</svg><figcaption class="fin-hint">Nettovermögen je Monatsende (Achse beginnt nicht bei null)</figcaption></figure>`;
  }

  function assetDialog(d, host, preset = {}) {
    let kind = preset.kind || 'Depot';
    BHModal.open({
      title: preset.name ? `Wert für ${esc(preset.name)}` : 'Wert eintragen', submitLabel: 'Speichern', busyLabel: 'Speichern …',
      body: `<label class="bh-label" for="fin-w-name">Name</label><input id="fin-w-name" class="bh-input" name="name" required maxlength="80" value="${esc(preset.name || '')}" placeholder="z. B. Depot DKB">
        <span class="bh-label">Art</span><div id="fin-w-kind"></div>
        <label class="bh-label" for="fin-w-value">Wert in €</label><input id="fin-w-value" class="bh-input" name="value" type="number" min="0" step="0.01" inputmode="decimal" required>
        <label class="bh-label" for="fin-w-on">Stand</label><input id="fin-w-on" class="bh-input" name="on" type="date" required value="${new Date().toISOString().slice(0, 10)}">
        <p class="fin-hint">Jeder Eintrag ist ein Punkt im Verlauf; ein neuer Wert ersetzt nicht die alten.</p>`,
      onOpen: (dlg) => { const pick = BHSelectCore.create(dlg.querySelector('#fin-w-kind'), { options: d.kinds.map((k) => ({ value: k, label: k })), value: kind, label: 'Art', searchable: false, onChange: (v) => { kind = v; pick.update({ value: v }); } }); },
      onSubmit: async (form) => {
        const v = Number(form.elements.value.value); if (!(v >= 0)) throw new Error('Bitte einen Wert eingeben.');
        await Fin.api('POST', '/wealth/assets', { name: form.elements.name.value.trim(), kind, value_cents: Math.round(v * 100), as_of: form.elements.on.value });
        Toast.success('Gespeichert'); render(host);
      },
    });
  }

  async function render(host) {
    const d = await Fin.api('GET', '/wealth'); const n = d.now;
    const yearStart = d.months.find((m) => m.on.slice(0, 4) === d.asOf.slice(0, 4)) || d.months[0];
    const prevEnd = [...d.months].reverse().find((m) => m.on < `${d.asOf.slice(0, 4)}-01-01`);
    const base = prevEnd || yearStart; const delta = n.net - base.net;
    AppShell.render(host, `<header class="app-topbar"><div><h1>Vermögen</h1><div class="sub">Wohnungen zum Marktwert minus Restschuld, Konten (privat und Immobilienkonten), Depot und Sonstiges. Kautionskonten zählen nicht, das Geld gehört den Mietern.</div></div>
      <div class="app-topbar-actions"><button type="button" class="bh-btn" data-add>Wert eintragen</button></div></header>
      ${AppShell.kpis([
    { label: 'Nettovermögen', value: euro(n.net), sub: `${delta >= 0 ? '+' : ''}${euro(delta)} seit ${esc(date(base.on))}` },
    { label: 'Immobilien netto', value: euro(n.estate - n.debt), sub: `Marktwert ${euro(n.estate)} − Restschuld ${euro(n.debt)}` },
    { label: 'Konten', value: euro(n.cash_private + n.cash_property), sub: `privat ${euro(n.cash_private)} · Immobilienkonten ${euro(n.cash_property)}` },
    { label: 'Depot und Sonstiges', value: euro(n.other), sub: d.assets.length ? `${d.assets.length} Positionen` : 'noch nichts eingetragen' },
  ])}
      ${line(d.months)}
      <p class="fin-hint">Verlauf ab ${esc(date(d.start))} (seitdem liegen für alle Konten Buchungen vor). Wohnungen mit heutigem Marktwert ab „Besitzer seit“; Restschuld aus den Kontoauszügen, dazwischen gleichmäßig verteilt.${d.missing.length ? ` Ohne Kontostand und daher nicht mitgezählt: ${esc(d.missing.join(', '))}.` : ''}</p>
      ${AppShell.list({ title: 'Depot und Sonstiges', className: 'fin-wealth-assets', columns: [
    { key: 'name', label: 'Name', html: (a) => `<strong>${esc(a.name)}</strong><div class="fin-hint">${esc(a.kind)} · ${a.history.length} ${a.history.length === 1 ? 'Eintrag' : 'Einträge'}</div>` },
    { key: 'value_cents', label: 'Wert', align: 'right', html: (a) => amt(a.value_cents) },
    { key: 'as_of', label: 'Stand', html: (a) => `<span class="fin-num">${esc(date(a.as_of))}</span>` },
    { key: 'act', label: 'Aktion', srOnly: true, sortable: false, html: (a) => `<button type="button" class="fin-link-btn" data-update="${esc(a.name)}" data-kind="${esc(a.kind)}">Neuer Wert</button>` },
  ], rows: d.assets, empty: 'Noch nichts eingetragen. Depot, Bausparvertrag oder Beteiligungen über „Wert eintragen“ erfassen.' })}
      ${AppShell.list({ title: 'Je Monatsende', className: 'fin-wealth-list', columns: [
    { key: 'on', label: 'Stand', html: (m) => `<span class="fin-num">${esc(date(m.on))}</span>` },
    { key: 'estate', label: 'Wohnungen', align: 'right', html: (m) => amt(m.estate) },
    { key: 'debt', label: 'Restschuld', align: 'right', html: (m) => amt(-m.debt) },
    { key: 'cash', label: 'Konten', align: 'right', html: (m) => amt(m.cash_private + m.cash_property) },
    { key: 'other', label: 'Depot u. a.', align: 'right', html: (m) => amt(m.other) },
    { key: 'net', label: 'Netto', align: 'right', html: (m) => `<strong>${amt(m.net)}</strong>` },
  ], rows: [...d.months].reverse() })}`);
    host.querySelector('[data-add]').addEventListener('click', () => assetDialog(d, host));
    host.querySelectorAll('[data-update]').forEach((b) => b.addEventListener('click', () => assetDialog(d, host, { name: b.dataset.update, kind: b.dataset.kind })));
  }

  return { render };
})();
