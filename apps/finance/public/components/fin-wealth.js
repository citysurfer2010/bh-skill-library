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

  /** Nice round step for about four grid lines (1, 2, 2.5 or 5 times a power of ten). */
  function niceStep(range) { const raw = range / 4; const p = 10 ** Math.floor(Math.log10(raw || 1)); return [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw) || raw; }
  const tsd = (c) => `${Math.round(c / 100000).toLocaleString('de-DE')} Tsd. €`;

  /**
   * Net worth over time: one 2px line over a light area, rounded y-axis (thousand euros, not from zero, said in the
   * caption), the latest value labelled at the line, quarter labels below. Hover or keyboard focus shows a crosshair
   * and a tooltip with the parts of that month.
   */
  function line(months) {
    const rows = months.slice(-36); if (rows.length < 2) return '';
    const W = 760; const H = 260; const L = 84; const R = 96; const T = 12; const B = 30;
    const vals = rows.map((m) => m.net); const step = niceStep((Math.max(...vals) - Math.min(...vals)) || Math.abs(vals[0]) * 0.05 || 100000);
    const lo = Math.floor(Math.min(...vals) / step) * step - step / 2; const hi = Math.ceil(Math.max(...vals) / step) * step + step / 2;
    const x = (i) => L + (i * (W - L - R)) / (rows.length - 1); const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const pts = rows.map((m, i) => `${x(i).toFixed(1)},${y(m.net).toFixed(1)}`);
    const grid = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(`<line x1="${L}" x2="${W - R + 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="fin-grid"/><text x="${L - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="fin-axis">${esc(tsd(v))}</text>`);
    const xl = rows.map((m, i) => (m.on.slice(5, 7) % 3 === 0 && m.on.slice(8) !== '' && i < rows.length - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="fin-axis">${esc(label(m.on))}</text>` : '')).join('');
    const last = rows.at(-1); const lx = x(rows.length - 1); const ly = y(last.net);
    const area = `M${pts[0]} L${pts.slice(1).join(' L')} L${lx.toFixed(1)},${(H - B).toFixed(1)} L${x(0).toFixed(1)},${(H - B).toFixed(1)} Z`;
    const hits = rows.map((m, i) => `<rect class="fin-hitcol" x="${(x(i) - (W - L - R) / (rows.length - 1) / 2).toFixed(1)}" y="${T}" width="${((W - L - R) / (rows.length - 1)).toFixed(1)}" height="${H - T - B}" data-i="${i}" tabindex="0" aria-label="${esc(label(m.on))}: ${esc(euro(m.net))}"/>`).join('');
    return `<figure class="fin-wealth-chart" data-chart><div class="fin-chart-box"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Nettovermögen je Monatsende, von ${esc(euro(rows[0].net))} auf ${esc(euro(last.net))}">
      ${grid.join('')}<path d="${area}" class="fin-area"/><polyline points="${pts.join(' ')}" class="fin-line"/>
      <line class="fin-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" hidden/><circle class="fin-dot fin-cur" r="5" cx="0" cy="0" hidden/>
      <circle class="fin-dot" r="4.5" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}"/><text x="${(lx + 10).toFixed(1)}" y="${(ly + 4).toFixed(1)}" class="fin-endlabel">${esc(tsd(last.net))}</text>
      ${xl}<text x="${lx.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="fin-axis">${esc(label(last.on))}</text>${hits}</svg>
      <div class="fin-tip" role="status" hidden></div></div>
      <figcaption class="fin-hint">Nettovermögen je Monatsende in Tausend Euro; die Achse beginnt nicht bei null, damit die Veränderung sichtbar ist.</figcaption></figure>`;
  }

  /** Crosshair and tooltip for the chart (pointer and keyboard). */
  function bindChart(host, months) {
    const fig = host.querySelector('[data-chart]'); if (!fig) return;
    const rows = months.slice(-36); const svg = fig.querySelector('svg'); const tip = fig.querySelector('.fin-tip');
    const cross = svg.querySelector('.fin-cross'); const cur = svg.querySelector('.fin-cur');
    const show = (i) => {
      const m = rows[i]; const r = svg.querySelector(`[data-i="${i}"]`); const cx = Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2;
      const pt = svg.querySelector('.fin-line').getAttribute('points').split(' ')[i].split(',').map(Number);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.hidden = false; cur.setAttribute('cx', pt[0]); cur.setAttribute('cy', pt[1]); cur.hidden = false;
      tip.innerHTML = `<strong>${esc(date(m.on))}</strong><dl><dt>Netto</dt><dd>${esc(euro(m.net))}</dd><dt>Immobilien netto</dt><dd>${esc(euro(m.estate - m.debt))}</dd><dt>Konten</dt><dd>${esc(euro(m.cash_private + m.cash_property))}</dd><dt>Depot u. a.</dt><dd>${esc(euro(m.other))}</dd></dl>`;
      tip.hidden = false; const box = fig.querySelector('.fin-chart-box').getBoundingClientRect(); const sx = box.width / svg.viewBox.baseVal.width;
      const left = cx * sx; tip.style.setProperty('--tip-x', `${Math.min(Math.max(left, 90), box.width - 90)}px`);
    };
    const hide = () => { tip.hidden = true; cross.hidden = true; cur.hidden = true; };
    svg.querySelectorAll('.fin-hitcol').forEach((r) => { const i = Number(r.dataset.i); r.addEventListener('pointerenter', () => show(i)); r.addEventListener('focus', () => show(i)); r.addEventListener('blur', hide); });
    svg.addEventListener('pointerleave', hide);
  }

  function assetDialog(d, host, preset = {}) {
    let kind = preset.kind || 'Depot';
    BHModal.open({
      title: preset.name ? `Wert für ${esc(preset.name)}` : 'Wert eintragen', submitLabel: 'Speichern', busyLabel: 'Speichern …',
      body: `<label class="bh-label" for="fin-w-name">Name</label><input id="fin-w-name" class="bh-input" name="name" required maxlength="80" value="${esc(preset.name || '')}" placeholder="z. B. Depot DKB">
        <span class="bh-label">Art</span><div id="fin-w-kind"></div>
        <label class="bh-label" for="fin-w-value">Wert in €</label><input id="fin-w-value" class="bh-input" name="value" type="number" min="0" step="0.01" inputmode="decimal" required>
        <label class="bh-label" for="fin-w-url">Link (optional)</label><input id="fin-w-url" class="bh-input" name="url" type="url" maxlength="300" placeholder="https://…" value="${esc(preset.url || '')}">
        <label class="bh-label" for="fin-w-on">Stand</label><input id="fin-w-on" class="bh-input" name="on" type="date" required value="${new Date().toISOString().slice(0, 10)}">
        <p class="fin-hint">Jeder Eintrag ist ein Punkt im Verlauf; ein neuer Wert ersetzt nicht die alten.</p>`,
      onOpen: (dlg) => { const pick = BHSelectCore.create(dlg.querySelector('#fin-w-kind'), { options: d.kinds.map((k) => ({ value: k, label: k })), value: kind, label: 'Art', searchable: false, onChange: (v) => { kind = v; pick.update({ value: v }); } }); },
      onSubmit: async (form) => {
        const v = Number(form.elements.value.value); if (!(v >= 0)) throw new Error('Bitte einen Wert eingeben.');
        await Fin.api('POST', '/wealth/assets', { name: form.elements.name.value.trim(), kind, value_cents: Math.round(v * 100), as_of: form.elements.on.value, url: form.elements.url.value.trim() || null });
        Toast.success('Gespeichert'); render(host);
      },
    });
  }

  function depotDialog(host) {
    BHModal.open({
      title: 'Depot-Export hochladen', submitLabel: 'Hochladen', busyLabel: 'Lese …',
      body: `<label class="bh-label" for="fin-depot-file">Datei (CSV aus dem Online-Banking, z. B. DKB „Depot exportieren“)</label><input id="fin-depot-file" class="bh-input" type="file" name="file" accept=".csv,text/csv" required>
        <p class="fin-hint">Die App summiert die Positionen (Bewertungskurs × Stückzahl) zum Erstellungsdatum und trägt den Depotwert in den Verlauf ein. Ein neuer Export am selben Tag ersetzt den alten.</p>`,
      onSubmit: async (form) => {
        const file = form.elements.file.files[0]; if (!file) throw new Error('Bitte eine Datei wählen.');
        const body = new FormData(); body.set('file', file);
        const r = await Fin.api('POST', '/wealth/depot', body);
        Toast.success(`${r.label}: ${euro(r.total_cents)} am ${date(r.on)} (${r.positions} Positionen)`); render(host);
      },
    });
  }

  function positionsList(list) {
    if (!list.length) return '';
    return AppShell.list({ title: `Depot-Positionen (Stand ${esc(date(list[0].as_of))})`, className: 'fin-wealth-assets', columns: [
      { key: 'name', label: 'Wertpapier', html: (p) => `<strong>${esc(p.name)}</strong><div class="fin-hint">${esc([p.asset_class, p.isin].filter(Boolean).join(' · '))}</div>` },
      { key: 'qty', label: 'Stück', align: 'right', html: (p) => `<span class="fin-num">${esc(p.qty.toLocaleString('de-DE', { maximumFractionDigits: 4 }))}</span>` },
      { key: 'price_cents', label: 'Kurs', align: 'right', html: (p) => amt(p.price_cents) },
      { key: 'value_cents', label: 'Wert', align: 'right', html: (p) => `<strong>${amt(p.value_cents)}</strong>` },
      { key: 'gain', label: 'Gewinn', align: 'right', sortValue: (p) => (p.invested_cents == null ? 0 : p.value_cents - p.invested_cents), html: (p) => (p.invested_cents == null ? '–' : `${amt(p.value_cents - p.invested_cents)}<div class="fin-hint">${esc((((p.value_cents - p.invested_cents) / p.invested_cents) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }))} %</div>`) },
    ], rows: list });
  }

  async function render(host) {
    const d = await Fin.api('GET', '/wealth'); const n = d.now;
    const yearStart = d.months.find((m) => m.on.slice(0, 4) === d.asOf.slice(0, 4)) || d.months[0];
    const prevEnd = [...d.months].reverse().find((m) => m.on < `${d.asOf.slice(0, 4)}-01-01`);
    const base = prevEnd || yearStart; const delta = n.net - base.net;
    AppShell.render(host, `<header class="app-topbar"><div><h1>Vermögen</h1><div class="sub">Wohnungen zum Marktwert minus Restschuld, Konten (privat und Immobilienkonten), Depot und Sonstiges. Kautionskonten zählen nicht, das Geld gehört den Mietern.</div></div>
      <div class="app-topbar-actions"><button type="button" class="bh-btn" data-depot>Depot-Export hochladen</button><button type="button" class="bh-btn" data-add>Wert eintragen</button></div></header>
      ${AppShell.kpis([
    { label: 'Nettovermögen', value: euro(n.net), sub: `${delta >= 0 ? '+' : ''}${euro(delta)} seit ${esc(date(base.on))}` },
    { label: 'Immobilien netto', value: euro(n.estate - n.debt), sub: `Marktwert ${euro(n.estate)} − Restschuld ${euro(n.debt)}` },
    { label: 'Konten', value: euro(n.cash_private + n.cash_property), sub: `privat ${euro(n.cash_private)} · Immobilienkonten ${euro(n.cash_property)}` },
    { label: 'Depot und Sonstiges', value: euro(n.other), sub: d.assets.length ? `${d.assets.length} Positionen` : 'noch nichts eingetragen' },
  ])}
      ${line(d.months)}
      <p class="fin-hint">Verlauf ab ${esc(date(d.start))} (seitdem liegen für alle Konten Buchungen vor). Wohnungen mit heutigem Marktwert ab „Besitzer seit“; Restschuld aus den Kontoauszügen, dazwischen gleichmäßig verteilt.${d.missing.length ? ` Ohne Kontostand und daher nicht mitgezählt: ${esc(d.missing.join(', '))}.` : ''}</p>
      ${AppShell.list({ title: 'Depot und Sonstiges', className: 'fin-wealth-assets', columns: [
    { key: 'name', label: 'Name', html: (a) => `<strong>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.name)}</a>` : esc(a.name)}</strong><div class="fin-hint">${esc(a.kind)} · ${a.history.length} ${a.history.length === 1 ? 'Eintrag' : 'Einträge'}</div>` },
    { key: 'value_cents', label: 'Wert', align: 'right', html: (a) => amt(a.value_cents) },
    { key: 'as_of', label: 'Stand', html: (a) => `<span class="fin-num">${esc(date(a.as_of))}</span>` },
    { key: 'act', label: 'Aktion', srOnly: true, sortable: false, html: (a) => `<button type="button" class="fin-link-btn" data-update="${esc(a.name)}" data-kind="${esc(a.kind)}" data-url="${esc(a.url || '')}">Neuer Wert</button>` },
  ], rows: d.assets, empty: 'Noch nichts eingetragen. Depot-Export hochladen oder Bausparvertrag und Beteiligungen über „Wert eintragen“ erfassen.' })}
      ${positionsList(d.positions || [])}
      ${AppShell.list({ title: 'Je Monatsende', className: 'fin-wealth-list', columns: [
    { key: 'on', label: 'Stand', html: (m) => `<span class="fin-num">${esc(date(m.on))}</span>` },
    { key: 'estate', label: 'Wohnungen', align: 'right', html: (m) => amt(m.estate) },
    { key: 'debt', label: 'Restschuld', align: 'right', html: (m) => amt(-m.debt) },
    { key: 'cash', label: 'Konten', align: 'right', html: (m) => amt(m.cash_private + m.cash_property) },
    { key: 'other', label: 'Depot u. a.', align: 'right', html: (m) => amt(m.other) },
    { key: 'net', label: 'Netto', align: 'right', html: (m) => `<strong>${amt(m.net)}</strong>` },
  ], rows: [...d.months].reverse() })}`);
    bindChart(host, d.months);
    host.querySelector('[data-add]').addEventListener('click', () => assetDialog(d, host));
    host.querySelector('[data-depot]').addEventListener('click', () => depotDialog(host));
    host.querySelectorAll('[data-update]').forEach((b) => b.addEventListener('click', () => assetDialog(d, host, { name: b.dataset.update, kind: b.dataset.kind, url: b.dataset.url })));
  }

  return { render };
})();
