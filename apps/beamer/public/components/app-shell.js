'use strict';
/**
 * Seitenhelfer. Navbar, Breadcrumb und Sidebar zeichnet der Rahmen (bh-app-shell.js), Listenseiten BHListPage + BHDataTable.
 * Eine Seite = Seitenkopf (Titel links, Aktionen rechts) + Inhalt. Knöpfe gehören in den Seitenkopf, nie in die Breadcrumb.
 *   AppShell.crumbs([['App', href], ['Seite']]) · AppShell.render(host, html) · AppShell.actions(html)
 * Ladestandard: Rahmen sofort aus dem Bekannten zeichnen, Inhalt zeigt Platzhalter, bis die Daten da sind; nie eine weiße Seite.
 *   AppShell.loading(host, title, kind)  'table' | 'cards' | 'form'     AppShell.links(prefix, go)  Links im Modul ohne Reload
 * Listen sind randlos, nie in einer .card. Kleine statische Listen (bis 10 Zeilen):
 *   AppShell.list({ columns: [{ key, label, html? }], rows, title?, empty?, rowHref? })
 *   AppShell.kpis([{ label, value, sub? }])   AppShell.listPage(host, { title, sub?, search?, count, countLabel?, toolbarLeft?, toolbarRight?, list })
 *   AppShell.chips(items: [[key, label, n?]], active, href(key))
 */
window.AppShell = (() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Breadcrumb des Rahmens. */
  function crumbs(items) {
    const shell = window.Navbar && Navbar.shell();
    if (shell) shell.setCrumbs(items);
    document.title = `${items[items.length - 1][0]} · Beamer`;
  }

  function render(host, html) {
    host.innerHTML = html;
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
   * Randlose Liste: sticky upper-case header, row hover, optional title and empty text.
   * columns: [{ key, label, html? }] — html(row) returns trusted HTML for that cell, otherwise row[key] is escaped.
   * rowHref(row) makes the first cell a link (same-module links navigate without reload via AppShell.links).
   */
  function list({ columns = [], rows = [], title = '', empty = 'Keine Einträge.', rowHref = null } = {}) {
    const head = `<thead><tr>${columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead>`;
    const cell = (c, r, i) => {
      const v = c.html ? c.html(r) : esc(r[c.key]);
      return i === 0 && rowHref ? `<td><a href="${esc(rowHref(r))}">${v}</a></td>` : `<td>${v}</td>`;
    };
    const body = rows.length
      ? `<tbody>${rows.map((r) => `<tr>${columns.map((c, i) => cell(c, r, i)).join('')}</tr>`).join('')}</tbody>`
      : '';
    return `<section class="app-list">${title ? `<h2 class="app-list-title">${esc(title)}</h2>` : ''}`
      + (rows.length ? `<table>${head}${body}</table>` : `<p class="muted">${esc(empty)}</p>`) + '</section>';
  }

  /** Kennzahl-Kacheln: label in capitals, big value, optional small line. */
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
