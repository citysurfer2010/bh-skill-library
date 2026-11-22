'use strict';
/** All accounts, grouped by scope (only "Haushalt" counts): rename, choose the scope, see bank, lines and open lines. */
window.FinAccounts = (() => {
  const BANK_NAMES = { Comdirect: 'comdirect', BBBank: 'BBBank', DKB: 'DKB', PayPal: 'PayPal' };
  const PEN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const when = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ',');

  const range = (a) => (a.first ? `<span class="fin-num">${Fin.esc(Fin.date(a.first))} – ${Fin.esc(Fin.date(a.last))}</span>` : '–');
  function openCell(a) {
    const { BASE } = Fin;
    if (!a.open) return '<span class="fin-num fin-muted">0</span>';
    if (a.scope !== 'haushalt') return `<span class="fin-num fin-muted" title="zählt nicht in „Zu prüfen“">${a.open}</span>`;
    return `<a class="fin-num" href="${BASE}/all/transactions?account=${encodeURIComponent(a.name)}&category=OFFEN">${a.open}</a>`;
  }

  function origin(a) {
    const { esc } = Fin;
    const meta = `<div class="fin-acc-meta">${a.balance != null ? `<span class="fin-nowrap">Stand ${Fin.amount(a.balance)}</span> ·&nbsp;` : ''}${a.bank?.last_sync_at ? `<span class="fin-nowrap">abgerufen ${Fin.esc(when(a.bank.last_sync_at))}</span> ·&nbsp;` : ''}<span class="fin-nowrap">${a.n} Buchungen</span> ·&nbsp;${range(a)} <span class="fin-nowrap">·&nbsp;${a.open} offen</span></div>`; // phone only
    if (!a.bank) return `<span class="fin-badge">CSV-Import</span>${meta}`;
    const b = a.bank; const product = [b.product, b.details && b.details !== b.product && !b.details.endsWith(a.name) ? b.details : ''].filter(Boolean).join(' · ');
    const expired = b.status !== 'active' ? ' <span class="fin-badge fin-badge-warn">Verbindung abgelaufen</span>' : '';
    const line = product ? Fin.esc(product) : '';
    return `<div><span class="fin-acc-bank">${esc(BANK_NAMES[b.aspsp] || b.aspsp)}</span>${b.iban ? ` <span class="fin-hint fin-num fin-acc-iban">${esc(b.iban)}</span>` : ''}${expired}</div>`
      + `${line ? `<div class="fin-hint">${line}</div>` : ''}${meta}`; // line is escaped above
  }

  const nameCell = (a) => `<div class="fin-acc-name" data-name="${Fin.esc(a.name)}" data-scope="${Fin.esc(a.scope)}"><strong title="${Fin.esc(a.name)}">${Fin.esc(a.name)}</strong><button type="button" class="fin-acc-rename" data-rename aria-label="${Fin.esc(a.name)} bearbeiten">${PEN}</button></div>`;

  const ORDER = ['haushalt', 'immobilien', 'treuhand'];

  /** Money per kind of account from the bank balances; a click filters the list (the filter is part of the address). */
  function kpis(totals, scopes) {
    return AppShell.kpis(ORDER.map((k) => {
      const t = totals[k]; const parts = [`${t.accounts} ${t.accounts === 1 ? 'Konto' : 'Konten'}`];
      if (t.asOf) parts.push(`Stand ${Fin.date(t.asOf)}`);
      if (t.withoutBalance) parts.push(`${t.withoutBalance} ohne Kontostand`);
      return { label: scopes[k], value: Fin.euro(t.cents), sub: parts.join(' · ') };
    }));
  }

  async function render(host, focus) {
    const { esc, BASE } = Fin;
    const { accounts, scopes, totals } = await Fin.api('GET', '/accounts');
    const want = new URLSearchParams(location.search).get('scope');
    const scope = ORDER.includes(want) ? want : 'all';
    const rows = scope === 'all' ? accounts : accounts.filter((a) => a.scope === scope);
    const chips = AppShell.chips([['all', 'Alle', accounts.length], ...ORDER.map((k) => [k, scopes[k], accounts.filter((a) => a.scope === k).length])], scope,
      (k) => (k === 'all' ? `${BASE}/accounts` : `${BASE}/accounts?scope=${k}`));
    AppShell.render(host, `<header class="app-topbar"><div><h1>Konten</h1><div class="sub">Nur Privatkonten zählen in Übersicht, Investments und „Zu prüfen“.</div></div></header>
      ${kpis(totals, scopes)}${chips}
      ${AppShell.list({ className: 'fin-acc-list', storageKey: 'finance-accounts', rows, empty: 'Keine Konten in dieser Auswahl.', columns: [
    { key: 'name', label: 'Konto', html: nameCell, sortValue: (a) => a.name },
    { key: 'scope', label: 'Kontoart', sortValue: (a) => ORDER.indexOf(a.scope), html: (a) => `<span class="fin-kind fin-kind-${esc(a.scope)}">${esc(scopes[a.scope] || a.scope)}</span>` },
    { key: 'bank', label: 'Bank und Produkt', html: origin, sortValue: (a) => (a.bank ? `${a.bank.aspsp} ${a.bank.product || ''}` : 'zzz CSV') },
    { key: 'balance', label: 'Kontostand', align: 'right', sortValue: (a) => (a.balance == null ? -1e15 : a.balance), html: (a) => (a.balance == null ? '<span class="fin-hint" title="Nur CSV-Import, kein Kontostand von der Bank">–</span>' : Fin.amount(a.balance)) },
    { key: 'synced', label: 'Abgerufen', sortValue: (a) => a.bank?.last_sync_at || '', html: (a) => (a.bank?.last_sync_at ? `<span class="fin-num fin-nowrap">${Fin.esc(when(a.bank.last_sync_at))}</span>` : '<span class="fin-hint" title="Nur CSV-Import">–</span>') },
    { key: 'n', label: 'Buchungen', align: 'right', html: (a) => `<span class="fin-num">${a.n}</span>${a.first ? `<div class="fin-hint"><span class="fin-nowrap">${Fin.esc(Fin.date(a.first))} –</span> <span class="fin-nowrap">${Fin.esc(Fin.date(a.last))}</span></div>` : ''}` },
    { key: 'open', label: 'Offen', align: 'right', html: openCell },
  ] })}`);
    bind(host, scopes);
    if (focus) {
      const el = [...host.querySelectorAll(focus.sel)].find((x) => x.closest('[data-name], [data-scope-for]')?.dataset[focus.key] === focus.name) || null;
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
    }
  }

  function bind(host, scopes) {
    host.querySelectorAll('[data-rename]').forEach((btn) => btn.addEventListener('click', () => renameForm(host, btn.closest('.fin-acc-name'), scopes)));
  }

  /** Rename in a dialog; focus comes back to the row's pencil. */
  /** Name and kind in one dialog; the list shows the kind but is not edited in the row (15.11.2026). */
  function renameForm(host, box, scopes) {
    const old = box.dataset.name; const scope = box.dataset.scope;
    FinRename.open({ current: old, scope, scopes,
      save: ({ name, scope: kind }, merge) => Fin.api('PATCH', `/accounts/${encodeURIComponent(old)}`, { ...(kind !== scope ? { scope: kind } : {}), ...(name !== old ? { name } : {}), ...(merge ? { merge: true } : {}) }),
      done: (name) => render(host, { sel: '[data-rename]', key: 'name', name }) });
  }

  return { render };
})();
