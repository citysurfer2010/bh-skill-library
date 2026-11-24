'use strict';
/**
 * Modul Einkommensteuer (24.11.2026): overview of all tax years (status, refund or back payment, filed, notice, open
 * documents) and one page per year with its links (Drive folder, draft, invoice overview) and the document to-dos.
 * 26.11.56: final return and notice linked in the overview, payout by the tax office, advisor fee and the result
 * after advice per year.
 */
window.FinTax = (() => {
  const { esc, euro, date } = Fin;
  const BASE = '/finance';
  const amt = (c) => (c == null ? '–' : `<span class="fin-num${c < 0 ? ' fin-neg' : ''}">${c > 0 ? '+' : ''}${esc(euro(c))}</span>`);
  const sign = (c) => (c == null ? '–' : `${c > 0 ? '+' : ''}${euro(c)}`);
  const link = (u, l) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>` : '');
  const docs = (r) => [link(r.return_url, 'Erklärung'), link(r.notice_url, 'Bescheid')].filter(Boolean).join(' · ') || '–';
  function paid(r) {
    if (r.paid_on) return `${amt(r.paid_cents)}<div class="fin-hint">am ${esc(date(r.paid_on))}</div>`;
    if (['Bescheid erhalten', 'abgeschlossen'].includes(r.status) && r.refund_cents) return '<span class="fin-hint">offen</span>';
    return '–';
  }
  const fee = (c) => (c ? `<span class="fin-num fin-neg">−${esc(euro(c))}</span>` : '–');
  const cents = (v) => { const t = String(v || '').trim(); return t === '' ? null : Math.round(Number(t) * 100); };
  const eur = (c) => (c == null ? '' : (c / 100).toFixed(2));

  function overview(host, d) {
    AppShell.render(host, `<header class="app-topbar"><div><h1>Einkommensteuer</h1><div class="sub">Alle Steuerjahre: Erstattung laut Bescheid, was das Finanzamt ausgezahlt hat, was der Steuerberater gekostet hat und was unterm Strich bleibt.</div></div>
      <div class="app-topbar-actions"><button type="button" class="bh-btn" data-new>Jahr anlegen</button></div></header>
      ${AppShell.kpis([
    { label: 'Vom Finanzamt ausgezahlt', value: euro(d.total_paid_cents), sub: `laut Bescheid ${euro(d.total_refund_cents)}` },
    { label: 'Steuerberater', value: euro(d.total_advisor_cents), sub: 'Kosten der Erklärungen' },
    { label: 'Ergebnis nach Beratung', value: sign(d.total_net_cents), sub: 'Erstattung minus Beraterkosten' },
    { label: 'Offene Unterlagen', value: String(d.open_todos), sub: d.open_todos ? 'noch zu besorgen oder scannen' : 'alles da' },
  ])}
      ${AppShell.list({ title: 'Steuerjahre', className: 'fin-tax-years', columns: [
    { key: 'year', label: 'Jahr', html: (r) => `<a href="${BASE}/tax/${r.year}"><strong>${r.year}</strong></a>` },
    { key: 'status', label: 'Stand', html: (r) => esc(r.status) },
    { key: 'refund_cents', label: 'Laut Bescheid', align: 'right', html: (r) => amt(r.refund_cents) },
    { key: 'paid_cents', label: 'Ausgezahlt', align: 'right', html: paid },
    { key: 'advisor_cents', label: 'Steuerberater', align: 'right', html: (r) => fee(r.advisor_cents) },
    { key: 'net_cents', label: 'Ergebnis', align: 'right', html: (r) => (r.net_cents == null ? '–' : `<strong>${amt(r.net_cents)}</strong>`) },
    { key: 'docs', label: 'Dokumente', html: docs },
    { key: 'open_todos', label: 'Offen', align: 'right', html: (r) => (r.open_todos ? `<strong>${r.open_todos}</strong>` : '–') },
  ], rows: d.items, empty: 'Noch keine Steuerjahre.' })}`);
    host.querySelector('[data-new]').addEventListener('click', () => edit(d.statuses, { year: new Date().getFullYear() - 1, status: 'in Vorbereitung' }, (y) => location.assign(`${BASE}/tax/${y}`), true));
  }

  function edit(statuses, y, onSaved, isNew = false) {
    let status = y.status;
    BHModal.open({
      title: isNew ? 'Steuerjahr anlegen' : `Einkommensteuer ${y.year} bearbeiten`, submitLabel: 'Speichern', busyLabel: 'Speichern …',
      body: `${isNew ? `<label class="bh-label" for="fin-tx-year">Jahr</label><input id="fin-tx-year" class="bh-input" name="year" type="number" min="2000" max="2100" required value="${y.year}">` : ''}
        <span class="bh-label">Stand</span><div id="fin-tx-status"></div>
        <label class="bh-label" for="fin-tx-refund">Erstattung (+) / Nachzahlung (−) in €</label><input id="fin-tx-refund" class="bh-input" name="refund" type="number" step="0.01" inputmode="decimal" value="${eur(y.refund_cents)}">
        <label class="bh-label" for="fin-tx-filed">Eingereicht am</label><input id="fin-tx-filed" class="bh-input" name="filed" type="date" value="${esc(y.filed_on || '')}">
        <label class="bh-label" for="fin-tx-notice">Bescheid vom</label><input id="fin-tx-notice" class="bh-input" name="notice" type="date" value="${esc(y.notice_on || '')}">
        <label class="bh-label" for="fin-tx-paidon">Ausgezahlt am</label><input id="fin-tx-paidon" class="bh-input" name="paidon" type="date" value="${esc(y.paid_on || '')}">
        <label class="bh-label" for="fin-tx-paid">Ausgezahlt in € (Nachzahlung negativ)</label><input id="fin-tx-paid" class="bh-input" name="paid" type="number" step="0.01" inputmode="decimal" value="${eur(y.paid_cents)}">
        <label class="bh-label" for="fin-tx-fee">Steuerberater-Kosten in € (brutto)</label><input id="fin-tx-fee" class="bh-input" name="fee" type="number" step="0.01" min="0" inputmode="decimal" value="${eur(y.advisor_cents)}">
        <label class="bh-label" for="fin-tx-ret">Finale Erklärung (Link)</label><input id="fin-tx-ret" class="bh-input" name="ret" type="url" value="${esc(y.return_url || '')}">
        <label class="bh-label" for="fin-tx-ntc">Bescheid (Link)</label><input id="fin-tx-ntc" class="bh-input" name="ntc" type="url" value="${esc(y.notice_url || '')}">
        <label class="bh-label" for="fin-tx-drive">Drive-Ordner (Link)</label><input id="fin-tx-drive" class="bh-input" name="drive" type="url" value="${esc(y.drive_url || '')}" placeholder="https://drive.google.com/…">
        <label class="bh-label" for="fin-tx-draft">Entwurf (Link)</label><input id="fin-tx-draft" class="bh-input" name="draft" type="url" value="${esc(y.draft_url || '')}">
        <label class="bh-label" for="fin-tx-inv">Rechnungsübersicht (Link)</label><input id="fin-tx-inv" class="bh-input" name="inv" type="url" value="${esc(y.invoices_url || '')}">
        <label class="bh-label" for="fin-tx-note">Notiz</label><input id="fin-tx-note" class="bh-input" name="note" maxlength="1000" value="${esc(y.note || '')}">`,
      onOpen: (dlg) => { const pick = BHSelectCore.create(dlg.querySelector('#fin-tx-status'), { options: statuses.map((s) => ({ value: s, label: s })), value: status, label: 'Stand', searchable: false, onChange: (v) => { status = v; pick.update({ value: v }); } }); },
      onSubmit: async (f) => {
        const year = isNew ? Number(f.elements.year.value) : y.year; const e = f.elements;
        await Fin.api('PUT', `/tax/${year}`, { status, refund_cents: cents(e.refund.value), paid_on: e.paidon.value || null, paid_cents: cents(e.paid.value), advisor_cents: cents(e.fee.value), return_url: e.ret.value.trim(), notice_url: e.ntc.value.trim(), filed_on: f.elements.filed.value || null, notice_on: f.elements.notice.value || null, drive_url: f.elements.drive.value.trim(), draft_url: f.elements.draft.value.trim(), invoices_url: f.elements.inv.value.trim(), note: f.elements.note.value.trim() });
        Toast.success('Gespeichert'); onSaved(year);
      },
    });
  }

  async function year(host, y) {
    const d = await Fin.api('GET', `/tax/${y}`); const t = d.year; const td = d.todos;
    const open = td.items.filter((x) => !x.done_at); const done = td.items.filter((x) => x.done_at);
    const links = [['Erklärung', t.return_url], ['Bescheid', t.notice_url], ['Drive-Ordner', t.drive_url], ['Entwurf', t.draft_url], ['Rechnungsübersicht', t.invoices_url]].filter(([, u]) => u);
    AppShell.render(host, `<header class="app-topbar"><div><h1>Einkommensteuer ${y}</h1><div class="sub">${esc(t.note || 'Stand, Unterlagen und Links für dieses Steuerjahr.')}</div></div>
      <div class="app-topbar-actions"><button type="button" class="bh-btn" data-edit-year>Bearbeiten</button><button type="button" class="bh-btn" data-add>Unterlage hinzufügen</button></div></header>
      ${AppShell.kpis([
    { label: 'Stand', value: t.status, sub: t.filed_on ? `eingereicht am ${date(t.filed_on)}` : 'noch nicht eingereicht' },
    { label: 'Erstattung / Nachzahlung', value: sign(t.refund_cents), sub: t.notice_on ? `Bescheid vom ${date(t.notice_on)}` : 'noch kein Bescheid' },
    { label: 'Ausgezahlt', value: t.paid_on ? sign(t.paid_cents) : '–', sub: t.paid_on ? `am ${date(t.paid_on)}` : 'noch nicht ausgezahlt' },
    { label: 'Ergebnis nach Beratung', value: sign(t.net_cents), sub: t.advisor_cents ? `Steuerberater ${euro(t.advisor_cents)}` : 'keine Beraterkosten erfasst' },
    { label: 'Offene Unterlagen', value: String(open.length), sub: `${done.length} erledigt` },
  ])}
      <section class="fin-tax-links" aria-label="Links">${links.length ? links.map(([l, u]) => `<a class="bh-btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>`).join('') : '<p class="fin-hint">Noch keine Links. Über „Bearbeiten“ den Drive-Ordner eintragen.</p>'}</section>
      ${FinTodos.table(open, 'Noch fehlende Unterlagen', 'Nichts offen.')}
      ${done.length ? FinTodos.table(done, 'Erledigt', '') : ''}`);
    const reload = () => year(host, y);
    host.querySelector('[data-edit-year]').addEventListener('click', () => edit(d.statuses, t, reload));
    host.querySelector('[data-add]').addEventListener('click', () => FinTodos.dialog(td.kinds, y, null, reload));
    FinTodos.bind(host, td, y, reload);
  }

  return { overview, year };
})();
