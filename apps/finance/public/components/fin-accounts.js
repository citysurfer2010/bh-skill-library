'use strict';
/** All accounts, grouped by scope (only "Haushalt" counts): rename, choose the scope, see bank, lines and open lines. */
window.FinAccounts = (() => {
  const BANK_NAMES = { Comdirect: 'comdirect', BBBank: 'BBBank', DKB: 'DKB', PayPal: 'PayPal' };
  const PEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
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
    const meta = `<div class="fin-acc-meta">${a.balance != null ? `<span class="fin-nowrap">Stand ${Fin.amount(a.balance)}</span> ·&nbsp;` : ''}<span class="fin-nowrap">${a.n} Buchungen</span> ·&nbsp;${range(a)} <span class="fin-nowrap">·&nbsp;${a.open} offen</span></div>`; // phone only
    if (!a.bank) return `<span class="fin-badge">CSV-Import</span>${meta}`;
    const b = a.bank; const product = [b.product, b.details && b.details !== b.product && !b.details.endsWith(a.name) ? b.details : ''].filter(Boolean).join(' · ');
    const expired = b.status !== 'active' ? ' <span class="fin-badge fin-badge-warn">Verbindung abgelaufen</span>' : '';
    const line = [product ? Fin.esc(product) : '', b.status === 'active' && b.last_sync_at ? `<span class="fin-acc-synced">abgerufen ${Fin.esc(when(b.last_sync_at))}</span>` : ''].filter(Boolean).join(' · ');
    return `<div><span class="fin-acc-bank">${esc(BANK_NAMES[b.aspsp] || b.aspsp)}</span>${b.iban ? ` <span class="fin-hint fin-num fin-acc-iban">${esc(b.iban)}</span>` : ''}${expired}</div>`
      + `${line ? `<div class="fin-hint">${line}</div>` : ''}${meta}`; // line is escaped above
  }

  const nameCell = (a) => `<div class="fin-acc-name" data-name="${Fin.esc(a.name)}"><strong title="${Fin.esc(a.name)}">${Fin.esc(a.name)}</strong><button type="button" class="bh-btn bh-btn-sm fin-acc-rename" data-rename aria-label="${Fin.esc(a.name)} umbenennen">${PEN}</button></div>`;

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
    { key: 'scope', label: 'Kontoart', sortValue: (a) => ORDER.indexOf(a.scope), html: (a) => `<div class="fin-acc-scope" data-scope-for="${esc(a.name)}" data-value="${esc(a.scope)}"></div>` },
    { key: 'bank', label: 'Bank und Produkt', html: origin, sortValue: (a) => (a.bank ? `${a.bank.aspsp} ${a.bank.product || ''}` : 'zzz CSV') },
    { key: 'balance', label: 'Kontostand', align: 'right', sortValue: (a) => (a.balance == null ? -1e15 : a.balance), html: (a) => (a.balance == null ? '<span class="fin-hint" title="Nur CSV-Import, kein Kontostand von der Bank">–</span>' : Fin.amount(a.balance)) },
    { key: 'n', label: 'Buchungen', align: 'right', html: (a) => `<span class="fin-num">${a.n}</span>${a.first ? `<div class="fin-hint fin-nowrap">${Fin.esc(Fin.date(a.first))} – ${Fin.esc(Fin.date(a.last))}</div>` : ''}` },
    { key: 'open', label: 'Offen', align: 'right', html: openCell },
  ] })}`);
    bind(host, scopes);
    if (focus) {
      const el = [...host.querySelectorAll(focus.sel)].find((x) => x.closest('[data-name], [data-scope-for]')?.dataset[focus.key] === focus.name) || null;
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
    }
  }

  function bind(host, scopes) {
    host.querySelectorAll('[data-scope-for]').forEach((el) => {
      const name = el.dataset.scopeFor; const old = el.dataset.value;
      const pick = BHSelectCore.create(el, { options: Object.entries(scopes).map(([value, label]) => ({ value, label })), value: old, label: `Kontoart von ${name}`,
        onChange: async (v) => {
          pick.update({ value: v });
          try {
            await Fin.api('PATCH', `/accounts/${encodeURIComponent(name)}`, { scope: v }); Toast.success(`${name}: ${scopes[v]}`);
            render(host, { sel: '[data-scope-for] .bhs__btn', key: 'scopeFor', name });
          } catch (x) { pick.update({ value: old }); Toast.error(x.message); }
        } });
    });
    host.querySelectorAll('[data-rename]').forEach((btn) => btn.addEventListener('click', () => renameForm(host, btn.closest('.fin-acc-name'))));
  }

  /** Rename in a dialog; focus comes back to the row's pencil. */
  function renameForm(host, box) {
    const old = box.dataset.name;
    FinRename.open({ current: old,
      save: (name, merge) => Fin.api('PATCH', `/accounts/${encodeURIComponent(old)}`, merge ? { name, merge: true } : { name }),
      done: (name) => render(host, { sel: '[data-rename]', key: 'name', name }) });
  }

  return { render };
})();
