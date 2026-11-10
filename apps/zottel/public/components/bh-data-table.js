/**
 * BHDataTable — the table of every BH app. Full width, never in a card, fixed header row, first column bold.
 * Sorts ALL rows before paging, aria-sort and Enter/Space in the header, column widths draggable and remembered per table,
 * tooltip on truncation, row link, loading placeholder, empty state, search, footer with "X–Y von N" and 50 | 100 | 500 per page.
 * Optional per table: selectable + bulkActions (selection survives paging and search); sticky: n pins the first n columns.
 *   const t = new BHDataTable({ container, storageKey, columns: [{ key, label, width?, sortable?, render?(row), sortValue?(row), align? }],
 *     rowHref?(row), emptyMessage?, onChange?(n), selectable?, bulkActions?: [{ id, label, danger?, onClick(rows, table) }], rowId?(row), itemLabel? });
 *   t.setRows(rows); t.setFilter(text); t.setLoading(true); t.selectedRows(); t.clearSelection();
 */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class BHDataTable {
    constructor(o) {
      this.o = Object.assign({ emptyMessage: 'Keine Einträge.', pageSizes: [50, 100, 500], selectable: false, bulkActions: [], rowId: (r) => r.id, itemLabel: ['Eintrag', 'Einträge'], sticky: 0 }, o);
      this.selected = new Set();
      this.rows = []; this.filter = ''; this.sort = { key: null, dir: 1 }; this.page = 0; this.loading = true;
      this.pageSize = Number(this.pref('page-size')) || this.o.pageSizes[0];
      try { this.widths = JSON.parse(this.pref('widths') || '{}'); } catch (_) { this.widths = {}; }
      const c = this.o.container;
      c.classList.add('bhdt-host');
      c.addEventListener('click', (e) => this.onClick(e));
      c.addEventListener('keydown', (e) => { const th = e.target.closest('th[data-sort]'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.toggleSort(th.dataset.sort); } });
      c.addEventListener('mousedown', (e) => this.onResizeStart(e));
      this.render();
    }

    pref(name, value) {
      const key = `bh-dt:${this.o.storageKey || 'table'}:${name}`;
      try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (_) { /* private mode */ }
      return null;
    }

    id(r) { return String(this.o.rowId(r)); }
    setRows(rows) { this.rows = rows || []; this.loading = false; this.page = 0; this.selected = new Set([...this.selected].filter((id) => this.rows.some((r) => this.id(r) === id))); this.render(); }
    selectedRows() { return this.rows.filter((r) => this.selected.has(this.id(r))); }
    clearSelection() { this.selected.clear(); this.render(); }
    setLoading(on) { this.loading = !!on; this.render(); }
    setFilter(text) { this.filter = String(text || '').trim().toLowerCase(); this.page = 0; this.render(); }

    visible() {
      const cols = this.o.columns;
      const rows = this.filter ? this.rows.filter((r) => cols.some((c) => String(r[c.key] == null ? '' : r[c.key]).toLowerCase().includes(this.filter))) : this.rows.slice();
      const c = cols.find((x) => x.key === this.sort.key);
      if (c) {
        const val = c.sortValue || ((r) => r[c.key]);
        rows.sort((a, b) => {
          const x = val(a), y = val(b);
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * this.sort.dir;
          return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'de', { numeric: true }) * this.sort.dir;
        });
      }
      return rows;
    }

    toggleSort(key) {
      this.sort = this.sort.key === key ? { key, dir: -this.sort.dir } : { key, dir: 1 };
      this.page = 0; this.render();
      const th = this.o.container.querySelector(`th[data-sort="${key}"]`); if (th) th.focus();
    }

    head(sel, allOnPage) {
      const box = sel ? `<th class="bhdt-sel" scope="col"><input type="checkbox" class="bhdt-check" data-check-page aria-label="Alle Einträge dieser Seite auswählen"${allOnPage ? ' checked' : ''}></th>` : '';
      return box + this.o.columns.map((c) => {
        const sortable = c.sortable !== false;
        const st = this.sort.key === c.key ? (this.sort.dir > 0 ? 'ascending' : 'descending') : 'none';
        return `<th scope="col"${sortable ? ` data-sort="${esc(c.key)}" tabindex="0" aria-sort="${st}"` : ''} class="${c.align === 'right' ? 'bhdt-right' : ''}">`
          + `<span class="bhdt-th-label">${esc(c.label)}</span>${sortable ? `<span class="bhdt-sort bhdt-sort-${st}" aria-hidden="true"><i></i><i></i></span>` : ''}`
          + `<span class="bhdt-resize" data-resize="${esc(c.key)}" aria-hidden="true"></span></th>`;
      }).join('');
    }

    body(rows, sel) {
      const cols = this.o.columns;
      if (this.loading) return Array.from({ length: 6 }, () => `<tr class="bhdt-loading">${sel ? '<td class="bhdt-sel"></td>' : ''}${cols.map(() => '<td><span class="bhdt-skel"></span></td>').join('')}</tr>`).join('');
      if (!rows.length) return `<tr class="bhdt-empty"><td colspan="${cols.length + (sel ? 1 : 0)}">${esc(this.filter ? 'Keine Treffer für die Suche.' : this.o.emptyMessage)}</td></tr>`;
      return rows.map((r) => {
        const on = this.selected.has(this.id(r));
        const cells = cols.map((c, i) => {
          const raw = r[c.key] == null ? '' : String(r[c.key]);
          let inner = c.render ? c.render(r) : esc(raw);
          if (i === 0 && this.o.rowHref) inner = `<a href="${esc(this.o.rowHref(r))}">${inner}</a>`;
          return `<td class="${i === 0 ? 'bhdt-first' : ''}${c.align === 'right' ? ' bhdt-right' : ''}" title="${esc(raw)}">${inner}</td>`;
        }).join('');
        return `<tr class="${this.o.rowHref ? 'bhdt-link' : ''}${on ? ' bhdt-selected' : ''}">${sel ? `<td class="bhdt-sel"><input type="checkbox" class="bhdt-check" data-check="${esc(this.id(r))}" aria-label="Auswählen"${on ? ' checked' : ''}></td>` : ''}${cells}</tr>`;
      }).join('');
    }

    render() {
      const sel = this.o.selectable;
      const all = this.visible(); const pages = Math.max(1, Math.ceil(all.length / this.pageSize));
      this.page = Math.min(this.page, pages - 1);
      const from = this.page * this.pageSize; const rows = all.slice(from, from + this.pageSize);
      const ids = rows.map((r) => this.id(r)); const allOnPage = ids.length > 0 && ids.every((id) => this.selected.has(id));
      const n = this.selected.size; const [one, many] = this.o.itemLabel;
      const banner = sel && n ? `<div class="bhdt-bulk" role="region" aria-label="Auswahl"><span class="bhdt-bulk-count">${n} ${esc(n === 1 ? one : many)} ausgewählt</span><span class="bhdt-bulk-sep" aria-hidden="true"></span>`
        + this.o.bulkActions.map((a) => `<button type="button" class="bhdt-bulk-btn${a.danger ? ' bhdt-danger' : ''}" data-bulk="${esc(a.id)}">${esc(a.label)}</button>`).join('')
        + (allOnPage && all.length > n ? `<button type="button" class="bhdt-link-btn" data-select-all>Alle ${all.length} Treffer auswählen</button>` : '')
        + '<button type="button" class="bhdt-link-btn bhdt-clear" data-select-none>Auswahl aufheben</button></div>' : '';
      const sizes = this.o.pageSizes.map((s) => `<button type="button" data-size="${s}" class="bhdt-size${s === this.pageSize ? ' active' : ''}" aria-pressed="${s === this.pageSize}">${s}</button>`).join('');
      const colgroup = (sel ? '<col class="bhdt-sel-col">' : '') + this.o.columns.map((c) => `<col data-col="${esc(c.key)}">`).join('');
      this.o.container.innerHTML = `${banner}<div class="bhdt-scroll"><table class="bhdt"><colgroup>${colgroup}</colgroup><thead><tr>${this.head(sel, allOnPage)}</tr></thead><tbody>${this.body(rows, sel)}</tbody></table></div>`
        + `<div class="bhdt-footer"><span>${all.length ? `${from + 1}–${from + rows.length} von ${all.length}` : '0 Einträge'}</span><span class="bhdt-pager"><span class="bhdt-sizes">Pro Seite ${sizes}</span>`
        + `<button type="button" data-page="-1" class="bhdt-nav"${this.page === 0 ? ' disabled' : ''}>‹ Zurück</button><span>Seite ${this.page + 1} / ${pages}</span>`
        + `<button type="button" data-page="1" class="bhdt-nav"${this.page >= pages - 1 ? ' disabled' : ''}>Weiter ›</button></span></div>`;
      this.o.container.querySelectorAll('col[data-col]').forEach((col) => {
        const c = this.o.columns.find((x) => x.key === col.dataset.col); const w = this.widths[c.key] || c.width;
        if (w) col.style.width = `${w}px`;
      });
      this.pin();
      if (this.o.onChange) this.o.onChange(all.length);
    }

    /** Pin the first `sticky` data columns (after the selection column): left offset = widths of the cells before. */
    pin() {
      const n = Number(this.o.sticky) || 0; if (!n) return;
      const table = this.o.container.querySelector('table.bhdt'); if (!table) return;
      const lead = this.o.selectable ? 1 : 0;
      const ths = [...table.querySelectorAll('thead th')];
      let left = 0;
      for (let i = 0; i < lead + n && i < ths.length; i++) {
        const cells = [ths[i], ...table.querySelectorAll(`tbody tr > td:nth-child(${i + 1})`)];
        cells.forEach((c) => { c.classList.add('bhdt-pin'); c.classList.toggle('bhdt-pin-last', i === lead + n - 1); c.style.left = `${left}px`; });
        left += ths[i].getBoundingClientRect().width;
      }
    }

    onClick(e) {
      if (e.target.closest('.bhdt-resize')) return;
      const box = e.target.closest('.bhdt-check');
      if (box) {
        const page = this.visible().slice(this.page * this.pageSize, (this.page + 1) * this.pageSize).map((r) => this.id(r));
        if (box.hasAttribute('data-check-page')) page.forEach((id) => (box.checked ? this.selected.add(id) : this.selected.delete(id)));
        else if (box.checked) this.selected.add(box.dataset.check); else this.selected.delete(box.dataset.check);
        this.render(); return;
      }
      if (e.target.closest('[data-select-all]')) { this.visible().forEach((r) => this.selected.add(this.id(r))); this.render(); return; }
      if (e.target.closest('[data-select-none]')) { this.clearSelection(); return; }
      const bulk = e.target.closest('[data-bulk]');
      if (bulk) { const a = this.o.bulkActions.find((x) => x.id === bulk.dataset.bulk); if (a) a.onClick(this.selectedRows(), this); return; }
      const th = e.target.closest('th[data-sort]'); if (th) { this.toggleSort(th.dataset.sort); return; }
      const size = e.target.closest('[data-size]');
      if (size) { this.pageSize = Number(size.dataset.size); this.pref('page-size', String(this.pageSize)); this.page = 0; this.render(); return; }
      const nav = e.target.closest('[data-page]'); if (nav) { this.page += Number(nav.dataset.page); this.render(); return; }
      const tr = e.target.closest('tr.bhdt-link');
      if (tr && !e.target.closest('a,button,input,label,.bhdt-sel')) { const a = tr.querySelector('a[href]'); if (a) a.click(); }
    }

    onResizeStart(e) {
      const handle = e.target.closest('.bhdt-resize'); if (!handle) return;
      e.preventDefault();
      const key = handle.dataset.resize; const col = this.o.container.querySelector(`col[data-col="${key}"]`);
      const startX = e.clientX; const startW = handle.closest('th').getBoundingClientRect().width;
      const move = (ev) => { const w = Math.max(80, Math.round(startW + ev.clientX - startX)); col.style.width = `${w}px`; this.widths[key] = w; };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); this.pref('widths', JSON.stringify(this.widths)); this.pin(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    }
  }

  window.BHDataTable = BHDataTable;
})();
