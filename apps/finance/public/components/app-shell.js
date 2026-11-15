'use strict';
/**
 * Page helpers. The frame (bh-app-shell.js) draws navbar, breadcrumb and sidebar; list pages use BHListPage + BHDataTable.
 * A page = page header (title left, actions right) + content. Buttons belong in the page header, never in the breadcrumb.
 *   AppShell.crumbs([['App', href], ['Page']]) · AppShell.render(host, html) · AppShell.actions(html)
 * Loading standard: draw the frame at once from what is known, content shows placeholders until data arrives; never a white page.
 *   AppShell.loading(host, title, kind)  'table' | 'cards' | 'form'     AppShell.links(prefix, go)  in-module links without reload
 * Lists are borderless, never in a .card. Small static lists (up to 10 rows):
 *   AppShell.list({ columns: [{ key, label, html?, align? }], rows | groups: [{ label, rows }], title?, empty?, rowHref?, className? })
 *   AppShell.kpis([{ label, value, sub? }])   AppShell.listPage(host, { title, sub?, search?, count, countLabel?, toolbarLeft?, toolbarRight?, list })
 *   AppShell.chips(items: [[key, label, n?]], active, href(key))
 */
window.AppShell = (() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Breadcrumb of the frame. */
  function crumbs(items) {
    const shell = window.Navbar && Navbar.shell();
    if (shell) shell.setCrumbs(items);
    document.title = `${items[items.length - 1][0]} · Finanzen`;
  }

  function render(host, html) {
    host.innerHTML = html;
    // Remembered list column widths; on a narrower window they shrink in proportion instead of pushing columns out of view.
    host.querySelectorAll('table[data-list-key]').forEach((table) => {
      const cols = [...table.querySelectorAll('col[data-w]')]; if (!cols.length) return;
      const sum = cols.reduce((s, c) => s + Number(c.dataset.w), 0); const room = table.parentElement.clientWidth || sum;
      const f = sum > room ? room / sum : 1;
      cols.forEach((c) => { c.style.width = `${Math.max(64, Math.floor(Number(c.dataset.w) * f))}px`; });
    });
    const top = host.querySelector(':scope > .app-topbar');
    const content = document.createElement('div');
    content.className = 'app-content';
    let n = top ? top.nextSibling : host.firstChild;
    while (n) { const next = n.nextSibling; content.appendChild(n); n = next; }
    host.appendChild(content);
    return content;
  }

  function actions(html) {
    const slot = document.querySelector('#page-host .app-topbar-actions');
    if (slot) slot.innerHTML = html || '';
    return slot;
  }

  // Widths via classes (no inline style, validate rule): app-skel-w10 … app-skel-w100 in layout.css.
  const bar = (w) => `<span class="app-skel app-skel-line app-skel-w${Math.min(100, Math.max(10, Math.round(w / 10) * 10))}"></span>`;
  function skeleton(kind = 'table') {
    const tileRow = `<div class="app-skel-tiles">${Array.from({ length: 4 }, () => `<div class="card app-skel-tile"><span class="app-skel app-skel-num"></span>${bar(60)}</div>`).join('')}</div>`;
    const rows = `<div class="app-list app-skel-list">${Array.from({ length: 7 }, (_, i) => `<div class="app-skel-row">${bar(28 + ((i * 17) % 30))}${bar(12)}${bar(10)}${bar(10)}</div>`).join('')}</div>`;
    const cards = `<div class="app-skel-cards">${Array.from({ length: 3 }, () => `<div class="card app-skel-card">${bar(40)}${bar(90)}${bar(75)}${bar(55)}</div>`).join('')}</div>`;
    const form = `<div class="card app-skel-card">${bar(30)}${bar(100)}${bar(30)}${bar(100)}${bar(20)}</div>`;
    return `<div class="app-skel-wrap" aria-busy="true" aria-label="Wird geladen">${kind === 'cards' ? cards : kind === 'form' ? form : tileRow + rows}</div>`;
  }

  /** Top bar with the known title immediately, placeholders below; the real render replaces it. */
  function loading(host, title = '', kind = 'table') {
    return render(host, `<header class="app-topbar"><div><h1>${esc(title) || '<span class="app-skel app-skel-title"></span>'}</h1></div><div class="app-topbar-actions" data-page-actions></div></header>${skeleton(kind)}`);
  }

  /** Same-module links navigate without a reload (sidebar, breadcrumb, in-page links). */
  function links(prefix, go) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const href = a.getAttribute('href');
      if (!href.startsWith(prefix) || href.includes('/api/')) return;
      e.preventDefault();
      go(href);
    });
  }

  /**
   * Borderless list: sticky upper-case header, row hover, optional title and empty text.
   * columns: [{ key, label, html? }] — html(row) returns trusted HTML for that cell, otherwise row[key] is escaped.
   * rowHref(row) makes the first cell a link (same-module links navigate without reload via AppShell.links).
   */
  /** Column widths of a list, dragged at the header's right edge and remembered per storageKey in this browser. */
  const listWidths = (key) => { try { return JSON.parse(localStorage.getItem(`bh-list:${key}:widths`) || '{}'); } catch (_) { return {}; } };
  const saveWidths = (table) => {
    const w = {}; table.querySelectorAll('col').forEach((c, j) => { w[j] = parseInt(c.style.width, 10); });
    try { localStorage.setItem(`bh-list:${table.dataset.listKey}:widths`, JSON.stringify(w)); } catch (_) { /* widths stay for this view only */ }
  };
  const freeze = (table) => { table.querySelectorAll('col').forEach((c, j) => { if (!c.style.width) c.style.width = `${Math.round(table.querySelectorAll('thead th')[j].getBoundingClientRect().width)}px`; }); table.classList.add('is-sized'); };
  const resetWidths = (table) => { try { localStorage.removeItem(`bh-list:${table.dataset.listKey}:widths`); } catch (_) { /* nothing stored */ } table.querySelectorAll('col').forEach((c) => { c.style.width = ''; }); table.classList.remove('is-sized'); };
  if (typeof document !== 'undefined' && !window.__bhListResize) {
    window.__bhListResize = true;
    document.addEventListener('pointerdown', (e) => {
      const h = e.target.closest && e.target.closest('.app-list-resize'); if (!h || e.button !== 0) return;
      e.preventDefault();
      const table = h.closest('table'); const col = table.querySelectorAll('col')[Number(h.dataset.col)];
      const startX = e.clientX; const startW = h.closest('th').getBoundingClientRect().width;
      freeze(table); h.setPointerCapture?.(e.pointerId);
      const move = (ev) => { col.style.width = `${Math.max(64, Math.round(startW + ev.clientX - startX))}px`; };
      const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); saveWidths(table); };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    // Keyboard: arrows change the width by 16 px, Home resets all widths of this list; double click resets too.
    document.addEventListener('keydown', (e) => {
      const h = e.target.closest && e.target.closest('.app-list-resize'); if (!h) return;
      const table = h.closest('table');
      if (e.key === 'Home') { e.preventDefault(); resetWidths(table); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); freeze(table);
      const col = table.querySelectorAll('col')[Number(h.dataset.col)];
      const w = Math.max(64, parseInt(col.style.width, 10) + (e.key === 'ArrowRight' ? 16 : -16));
      col.style.width = `${w}px`; h.setAttribute('aria-valuenow', String(w)); saveWidths(table);
    });
    document.addEventListener('dblclick', (e) => { const h = e.target.closest && e.target.closest('.app-list-resize'); if (h) resetWidths(h.closest('table')); });
  }

  function list({ columns = [], rows = [], title = '', empty = 'Keine Einträge.', rowHref = null, groups = null, className = '', storageKey = '' } = {}) {
    const al = (c) => (c.align ? ` class="is-${c.align}"` : '');
    const widths = storageKey ? listWidths(storageKey) : {};
    const handle = (i) => (storageKey && i < columns.length - 1 ? `<span class="app-list-resize" data-col="${i}" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Breite der Spalte ${esc(columns[i].label)} (Pfeiltasten, Pos1 setzt zurück)"></span>` : '');
    const head = `<thead><tr>${columns.map((c, i) => `<th scope="col"${al(c)}>${esc(c.label)}${handle(i)}</th>`).join('')}</tr></thead>`;
    const sized = storageKey && Object.keys(widths).length;
    const cols = storageKey ? `<colgroup>${columns.map((_, i) => `<col${widths[i] ? ` data-w="${Number(widths[i])}"` : ''}>`).join('')}</colgroup>` : '';
    const cell = (c, r, i) => {
      const v = c.html ? c.html(r) : esc(r[c.key]);
      return i === 0 && rowHref ? `<td${al(c)}><a href="${esc(rowHref(r))}">${v}</a></td>` : `<td${al(c)}>${v}</td>`;
    };
    const tr = (r) => `<tr>${columns.map((c, i) => cell(c, r, i)).join('')}</tr>`;
    // groups: [{ label (trusted HTML), rows }] → ONE table with a group row per group, so the columns stay aligned.
    const shown = groups ? groups.filter((g) => g.rows.length) : null;
    const any = shown ? shown.length > 0 : rows.length > 0;
    const body = shown
      ? shown.map((g) => `<tr class="app-list-group"><th colspan="${columns.length}" scope="colgroup">${g.label}</th></tr>${g.rows.map(tr).join('')}`).join('')
      : rows.map(tr).join('');
    return `<section class="app-list${className ? ` ${esc(className)}` : ''}">${title ? `<h2 class="app-list-title">${esc(title)}</h2>` : ''}`
      + (any ? `<table${storageKey ? ` data-list-key="${esc(storageKey)}"${sized ? ' class="is-sized"' : ''}` : ''}>${cols}${head}<tbody>${body}</tbody></table>` : `<p class="muted">${esc(empty)}</p>`) + '</section>';
  }

  /** KPI tiles: label in capitals, big value, optional small line. */
  function kpis(items = []) {
    return `<div class="app-kpis">${items.map((k) => `<div class="card app-kpi"><div class="app-kpi-label">${esc(k.label)}</div>`
      + `<div class="app-kpi-value">${esc(k.value)}</div>${k.sub ? `<div class="app-kpi-sub">${esc(k.sub)}</div>` : ''}</div>`).join('')}</div>`;
  }


  const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

  function chips(items, active, href) {
    return `<div class="app-chips">${items.map(([k, l, n]) => `<a class="app-chip${k === active ? ' is-active' : ''}" href="${esc(href(k))}"${k === active ? ' aria-current="true"' : ''}>`
      + `${esc(l)}${n == null ? '' : ` <span class="app-chip-n">${esc(n)}</span>`}</a>`).join('')}</div>`;
  }

  function listPage(host, { title, sub = '', search = null, count = 0, countLabel = 'Einträge', toolbarLeft = '', toolbarRight = '', list: listHtml = '' } = {}) {
    const searchHtml = search ? `<label class="app-search">${SEARCH_SVG}<input type="search" data-app-search placeholder="${esc(search.placeholder || 'Suchen…')}" value="${esc(search.value || '')}" aria-label="${esc(search.placeholder || 'Suchen')}"></label>` : '';
    const content = render(host, `<header class="app-topbar"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`
      + `<div class="app-topbar-actions" data-page-actions>${searchHtml}</div></header>`
      + `<div class="app-toolbar"><div class="app-toolbar-left"><span class="app-count">${esc(Number(count).toLocaleString('de-DE'))} ${esc(countLabel)}</span>${toolbarLeft}</div>`
      + `<div class="app-toolbar-right">${toolbarRight}</div></div>${listHtml}`);
    const input = host.querySelector('[data-app-search]');
    if (input && search && typeof search.onInput === 'function') {
      let t = null;
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => search.onInput(input.value.trim()), 250); });
    }
    return content;
  }

  return { crumbs, render, actions, esc, skeleton, loading, links, list, listPage, chips, kpis };
})();
