/**
 * BHListPage — layout of every list page: page header (68 px) with heading, search and actions, optional KPI filter boxes,
 * toolbar (48 px) with hit count and chips, below it the borderless table. Styles: public/css/bh-table.css.
 *   const page = BHListPage.render(host, { title, sub?, actions?, search?: { placeholder, value?, onInput(text) },
 *     kpis?: [{ key, label, value, sub?, href? }], kpiActive?, onKpi?(key), chips?: [{ key, label, count?, href? }], chipActive?, onChip?(key),
 *     countLabel?, topActions?/toolbarActions?: [{ id?, label, onClick?(), href?, primary?, icon? }], toolbarRight?, table?, content?, toolbar?: false });
 *   page.table · page.setCount(n) · page.setKpis(items, active) · page.setChips(items, active) · page.contentEl · page.toolbarRightEl · page.searchEl
 * A search with a table and without onInput filters the table directly.
 */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
  const num = (n) => (typeof n === 'number' ? n.toLocaleString('de-DE') : esc(n));

  function item(cls, it, active, inner) {
    const on = it.key === active;
    return it.href
      ? `<a class="${cls}${on ? ' is-active' : ''}" href="${esc(it.href)}" data-key="${esc(it.key)}"${on ? ' aria-current="true"' : ''}>${inner}</a>`
      : `<button type="button" class="${cls}${on ? ' is-active' : ''}" data-key="${esc(it.key)}" aria-pressed="${on}">${inner}</button>`;
  }

  function kpisHtml(items, active) {
    return (items || []).map((k) => item('bhlp-kpi', k, active,
      `<span class="bhlp-kpi-label">${esc(k.label)}</span><span class="bhlp-kpi-value">${num(k.value)}</span>${k.sub ? `<span class="bhlp-kpi-sub">${esc(k.sub)}</span>` : ''}`)).join('');
  }

  function chipsHtml(items, active) {
    return (items || []).map((c) => item('bhlp-chip', c, active,
      `${esc(c.label)}${c.count == null ? '' : ` <span class="bhlp-chip-n">${num(c.count)}</span>`}`)).join('');
  }

  // Buttons from data: main action blue, otherwise outlined.
  function buttonsHtml(list, area) {
    return (list || []).map((b, i) => {
      const cls = `bhlp-btn${b.primary ? ' bhlp-btn-primary' : ''}`;
      const inner = `${b.icon && window.BHAppShell && window.BHAppShell.ICONS[b.icon] ? window.BHAppShell.ICONS[b.icon] : ''}<span>${esc(b.label)}</span>`;
      return b.href ? `<a class="${cls}" href="${esc(b.href)}">${inner}</a>`
        : `<button type="button" class="${cls}" data-${area}="${i}">${inner}</button>`;
    }).join('');
  }

  function render(host, o = {}) {
    const [one, many] = o.countLabel || ['Eintrag', 'Einträge'];
    const search = o.search ? `<label class="bhlp-search">${SEARCH}<input type="search" placeholder="${esc(o.search.placeholder || 'Suchen …')}" aria-label="${esc(o.search.placeholder || 'Suchen')}" value="${esc(o.search.value || '')}"></label>` : '';
    host.innerHTML = `<div class="bhlp">
      <header class="bhlp-top"><div class="bhlp-heading"><h1>${esc(o.title || '')}</h1>${o.sub ? `<div class="bhlp-sub">${esc(o.sub)}</div>` : ''}</div>
        <div class="bhlp-actions">${search}${o.actions || ''}${buttonsHtml(o.topActions, 'top')}</div></header>
      <div class="bhlp-kpis" role="group" aria-label="Kennzahlen"></div>
      <div class="bhlp-toolbar"><div class="bhlp-toolbar-left"><span class="bhlp-count" aria-live="polite"></span><div class="bhlp-chips" role="group" aria-label="Filter"></div></div>
        <div class="bhlp-toolbar-right">${o.toolbarRight || ''}${buttonsHtml(o.toolbarActions, 'tool')}</div></div>
      <div class="bhlp-content">${o.content || ''}</div>
    </div>`;
    const root = host.querySelector('.bhlp');
    const kpiEl = root.querySelector('.bhlp-kpis'); const chipEl = root.querySelector('.bhlp-chips');
    const countEl = root.querySelector('.bhlp-count'); const contentEl = root.querySelector('.bhlp-content');
    const api = {
      root, contentEl, table: null,
      searchEl: root.querySelector('.bhlp-search input'), toolbarRightEl: root.querySelector('.bhlp-toolbar-right'),
      setCount(n) { countEl.textContent = `${Number(n).toLocaleString('de-DE')} ${n === 1 ? one : many}`; },
      setKpis(items, active) { kpiEl.innerHTML = kpisHtml(items, active); kpiEl.hidden = !(items && items.length); },
      setChips(items, active) { chipEl.innerHTML = chipsHtml(items, active); },
    };
    if (o.toolbar === false) root.querySelector('.bhlp-toolbar').hidden = true;
    api.setKpis(o.kpis, o.kpiActive);
    api.setChips(o.chips, o.chipActive);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-top], button[data-tool]'); if (!b) return;
      const a = b.dataset.top != null ? (o.topActions || [])[b.dataset.top] : (o.toolbarActions || [])[b.dataset.tool];
      if (a && a.onClick) a.onClick(e);
    });
    kpiEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-key]'); if (b && o.onKpi) o.onKpi(b.dataset.key); });
    chipEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-key]'); if (b && o.onChip) o.onChip(b.dataset.key); });
    if (o.table && window.BHDataTable) {
      contentEl.classList.add('bhlp-table');
      api.table = new window.BHDataTable(Object.assign({ itemLabel: [one, many] }, o.table, {
        container: contentEl, onChange: (n) => { api.setCount(n); if (o.table.onChange) o.table.onChange(n); },
      }));
    }
    if (api.searchEl) {
      let t = null;
      api.searchEl.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { const v = api.searchEl.value.trim(); if (o.search.onInput) o.search.onInput(v); else if (api.table) api.table.setFilter(v); }, 200);
      });
    }
    return api;
  }

  window.BHListPage = { render };
})();
