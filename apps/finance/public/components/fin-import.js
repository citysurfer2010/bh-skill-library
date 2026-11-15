'use strict';
/**
 * „Konten und Import“ (Matti 15.11.2026: as tables, actions in the page header, each in a dialog):
 * connections (bank accounts and Amazon) and the import history. Who may see the finances lives on the admin page.
 */
window.FinImport = (() => {
  const when = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

  async function render(host) {
    const { esc, date } = Fin;
    // A refresh while a fetch runs keeps the keyboard focus where it was.
    const fx = document.activeElement; const refocus = fx && host.contains(fx) ? ['data-act', 'data-renew', 'data-bank-drop', 'data-amazon-open', 'data-bank-rename'].map((a) => (fx.hasAttribute(a) ? `[${a}${fx.getAttribute(a) ? `="${CSS.escape(fx.getAttribute(a))}"` : ''}]` : null)).find(Boolean) : null;
    const [{ imports }, bank, amazon] = await Promise.all([Fin.api('GET', '/imports'), Fin.api('GET', '/bank/status'), Fin.api('GET', '/amazon/status').catch(() => null)]);
    const rows = FinBank.rows(bank).concat(FinAmazon.rows(amazon));
    const running = bank.running || amazon?.running;
    AppShell.render(host, `<header class="app-topbar"><div><h1>Konten und Import</h1><div class="sub">Banken und Amazon liefern einmal am Tag von selbst; CSV-Exporte für alles andere.</div></div>
      <div class="app-topbar-actions"><button type="button" class="bh-btn" data-act="sync" ${running ? 'disabled' : ''}>${running ? 'Abruf läuft …' : 'Jetzt abrufen'}</button>
        <button type="button" class="bh-btn" data-act="csv">CSV importieren</button>${amazon?.configured ? `<button type="button" class="bh-btn" data-act="amazon">${amazon.connected ? 'Amazon' : 'Amazon verbinden'}</button>` : ''}
        ${bank.configured ? '<button type="button" class="bh-btn bh-btn-primary" data-act="bank">Bank verbinden</button>' : ''}</div></header>
      ${AppShell.list({ title: 'Verbindungen', className: 'fin-conn-list', storageKey: 'finance-connections', rows, empty: bank.configured ? 'Noch keine Bank verbunden. Oben „Bank verbinden“.' : 'Die Bankanbindung ist auf diesem Server nicht eingerichtet.', columns: [
    { key: 'name', label: 'Verbindung', html: (r) => r.nameHtml, sortValue: (r) => r.name },
    { key: 'source', label: 'Quelle', html: (r) => r.sourceHtml, sortValue: (r) => (r.kind === 'amazon' ? 'zz' : r.aspsp) },
    { key: 'access', label: 'Zugriff', html: (r) => r.accessHtml, sortValue: (r) => r.sortAccess },
    { key: 'synced', label: 'Abgerufen', html: (r) => `${r.synced ? `<span class="fin-num fin-nowrap">${esc(when(r.synced))}</span>` : '–'}${r.from ? `<div class="fin-hint fin-nowrap">Daten ab ${esc(date(r.from))}</div>` : ''}`, sortValue: (r) => r.synced || '' },
    { key: 'status', label: 'Status', html: (r) => r.statusHtml, sortable: false },
    { key: 'actions', label: 'Aktionen', srOnly: true, html: (r) => `<div class="fin-row-actions">${r.actionsHtml}</div>`, sortable: false },
  ] })}
      ${AppShell.list({ title: 'Bisherige Importe', className: 'fin-imp-list', storageKey: 'finance-imports', rows: imports, empty: 'Noch keine Importe.', columns: [
    { key: 'created_at', label: 'Am', html: (r) => esc(date(r.created_at.slice(0, 10))), sortValue: (r) => r.created_at },
    { key: 'filename', label: 'Quelle' }, { key: 'account', label: 'Konto' },
    { key: 'range', label: 'Zeitraum', html: (r) => (r.first ? `${esc(date(r.first))} – ${esc(date(r.last))}` : '–'), sortValue: (r) => r.first || '' },
    { key: 'added', label: 'Neu', align: 'right' }, { key: 'duplicates', label: 'Schon vorhanden', align: 'right' },
  ] })}`);
    const again = () => render(host);
    if (refocus) host.querySelector(refocus)?.focus();
    FinBank.bind(host, bank, again); FinAmazon.bind(host, amazon, again); FinBank.afterReturn(bank, again);
    const act = (name, fn) => host.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);
    act('bank', () => FinBank.connectDialog(bank));
    act('amazon', () => FinAmazon.dialog(amazon, again));
    act('csv', () => FinCsv.open(again));
    act('sync', async (e) => {
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Abruf läuft …';
      const amz = amazon?.configured && amazon.connected ? Fin.api('POST', '/amazon/sync').catch(() => null) : null;
      try { const { results } = await Fin.api('POST', '/bank/sync'); const m = FinBank.summary(results); (m.ok ? Toast.success : Toast.error)(`Banken: ${m.text}${amz ? '. Amazon läuft im Hintergrund.' : ''}`); } catch (x) { Toast.error(x.message); }
      again();
    });
  }

  return { render };
})();
