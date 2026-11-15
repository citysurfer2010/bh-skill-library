'use strict';
/** All accounts, grouped by scope (only "Haushalt" counts): rename, choose the scope, see bank, lines and open lines. */
window.FinAccounts = (() => {
  const BANK_NAMES = { Comdirect: 'comdirect', BBBank: 'BBBank', DKB: 'DKB', PayPal: 'PayPal' };
  const GROUP_HINT = { haushalt: 'zählt in Übersicht, Investments und „Zu prüfen“', immobilien: 'zählt nicht im Haushalt', treuhand: 'Geld Dritter, zählt nicht im Haushalt' };
  const PEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const when = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ',');

  const range = (a) => (a.first ? `<span class="fin-num">${Fin.esc(Fin.date(a.first))} – ${Fin.esc(Fin.date(a.last))}</span>` : '–');
  function openCell(a) {
    const { BASE } = Fin;
    if (!a.open) return '<span class="fin-num fin-muted">0</span>';
    if (a.scope !== 'haushalt') return `<span class="fin-num fin-muted" title="zählt nicht in „Zu prüfen“">${a.open}</span>`;
    return `<a class="fin-num" href="${BASE}/transactions?account=${encodeURIComponent(a.name)}&category=OFFEN&year=all">${a.open}</a>`;
  }

  function origin(a) {
    const { esc } = Fin;
    const meta = `<div class="fin-acc-meta">${a.n} Buchungen · ${range(a)} · ${a.open} offen</div>`; // phone only
    if (!a.bank) return `<span class="fin-badge">CSV-Import</span>${meta}`;
    const b = a.bank; const product = [b.product, b.details && b.details !== b.product && !b.details.endsWith(a.name) ? b.details : ''].filter(Boolean).join(' · ');
    const expired = b.status !== 'active' ? ' <span class="fin-badge fin-badge-warn">Verbindung abgelaufen</span>' : '';
    const line = [product, b.status === 'active' && b.last_sync_at ? `abgerufen ${when(b.last_sync_at)}` : ''].filter(Boolean).join(' · ');
    return `<div><span class="fin-acc-bank">${esc(BANK_NAMES[b.aspsp] || b.aspsp)}</span>${b.iban ? ` <span class="fin-hint fin-num fin-acc-iban">${esc(b.iban)}</span>` : ''}${expired}</div>`
      + `${line ? `<div class="fin-hint">${esc(line)}</div>` : ''}${meta}`;
  }

  const nameCell = (a) => `<div class="fin-acc-name" data-name="${Fin.esc(a.name)}"><strong title="${Fin.esc(a.name)}">${Fin.esc(a.name)}</strong><button type="button" class="bh-btn bh-btn-sm fin-acc-rename" data-rename aria-label="${Fin.esc(a.name)} umbenennen">${PEN}</button></div>`;

  async function render(host, focus) {
    const { esc } = Fin;
    const { accounts, scopes } = await Fin.api('GET', '/accounts');
    const household = accounts.filter((a) => a.scope === 'haushalt').length;
    const groups = Object.entries(scopes).map(([key, label]) => {
      const rows = accounts.filter((a) => a.scope === key);
      return { label: `${esc(label)} · ${rows.length} ${rows.length === 1 ? 'Konto' : 'Konten'} <span class="fin-hint">${esc(GROUP_HINT[key] || '')}</span>`, rows };
    });
    AppShell.render(host, `<header class="app-topbar"><div><h1>Konten</h1><div class="sub">${accounts.length} Konten, davon ${household} im Haushalt</div></div></header>
      ${AppShell.list({ className: 'fin-acc-list', groups, empty: 'Noch keine Konten. Sie entstehen mit dem ersten Import oder Bankabruf.', columns: [
    { key: 'name', label: 'Konto', html: nameCell },
    { key: 'bank', label: 'Bank und Produkt', html: origin },
    { key: 'scope', label: 'Bereich', html: (a) => `<div class="fin-acc-scope" data-scope-for="${esc(a.name)}" data-value="${esc(a.scope)}"></div>` },
    { key: 'n', label: 'Buchungen', align: 'right', html: (a) => `<span class="fin-num">${a.n}</span>` },
    { key: 'range', label: 'Zeitraum', html: range },
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
      const pick = BHSelectCore.create(el, { options: Object.entries(scopes).map(([value, label]) => ({ value, label })), value: old, label: `Bereich von ${name}`,
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

  /** One line: field, save, cancel. Joining an existing account asks first, in place. */
  function renameForm(host, box) {
    const { esc } = Fin; const old = box.dataset.name; const id = `fin-acc-${Math.random().toString(36).slice(2, 8)}`;
    const back = (name) => render(host, { sel: '[data-rename]', key: 'name', name });
    box.innerHTML = `<form class="fin-acc-form"><label class="sr-only" for="${id}">Kontoname</label><input id="${id}" class="bh-input" maxlength="60" value="${esc(old)}" required>
      <button type="submit" class="bh-btn bh-btn-sm bh-btn-primary">Speichern</button><button type="button" class="bh-btn bh-btn-sm" data-cancel>Abbrechen</button></form>`;
    const form = box.querySelector('form'); const input = form.querySelector('input'); input.focus(); input.select();
    form.querySelector('[data-cancel]').addEventListener('click', () => back(old));
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); back(old); } });
    const save = async (merge) => {
      const name = input.value.trim();
      try { await Fin.api('PATCH', `/accounts/${encodeURIComponent(old)}`, merge ? { name, merge: true } : { name }); Toast.success(merge ? 'Zusammengeführt' : 'Umbenannt'); back(name); } catch (x) {
        if (x.code !== 'merge') { Toast.error(x.message); return; }
        box.classList.add('is-asking');
        box.innerHTML = `<div class="fin-acc-ask" role="status">Mit bestehendem Konto „${esc(name)}“ zusammenführen? Die Bank-Buchungen werden mit den vorhandenen verbunden, das lässt sich nicht rückgängig machen.</div>
          <div class="fin-inline"><button type="button" class="bh-btn bh-btn-sm bh-btn-primary" data-merge-yes>Zusammenführen</button><button type="button" class="bh-btn bh-btn-sm" data-merge-no>Abbrechen</button></div>`;
        box.querySelector('[data-merge-no]').focus();
        box.querySelector('[data-merge-no]').addEventListener('click', () => back(old));
        box.querySelector('[data-merge-yes]').addEventListener('click', () => { input.value = name; save(true); });
      }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  }

  return { render };
})();
