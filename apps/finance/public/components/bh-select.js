/* bh-select.js — the BH dropdown (framework-neutral), no native <select>.
 * window.BHSelectCore.create(host, opts) -> { update(partialOpts), destroy() }.
 * opts: value, options [{value,label,disabled,hint}], onChange(value), placeholder, searchable (default: more than 8 entries), disabled,
 *       size 'md'|'sm', label (aria-label), triggerText, searchPlaceholder, testId.
 * List in a portal (position: fixed), opens up/down; keyboard: arrows, Enter, Esc, Home/End, type-ahead; phone: bottom sheet. */
(function () {
  const SEARCH_FROM = 9; // Search only with more than 8 entries
  let uid = 0;
  function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const CHEV = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

  function create(host, initial) {
    const id = 'bhs' + (++uid);
    let o = Object.assign({ options: [], size: 'md' }, initial), isOpen = false, q = '', act = 0, buf = '', bufT = null, shown = [], pos = null;
    let pop = null, list = null, input = null, scrim = null;
    host.classList.add('bhs');
    const btn = h('button', 'bhs__btn'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox');
    host.appendChild(btn);
    const searchable = () => (o.searchable == null ? o.options.length >= SEARCH_FROM : !!o.searchable);

    function drawBtn() {
      const cur = o.options.find((x) => x.value === o.value);
      btn.className = 'bhs__btn' + (o.triggerText ? ' bhs__btn--link' : '') + (o.size === 'sm' ? ' bhs__btn--sm' : '') + (!cur && !o.triggerText ? ' is-empty' : '');
      btn.disabled = !!o.disabled; btn.setAttribute('aria-expanded', String(isOpen));
      if (o.label) btn.setAttribute('aria-label', o.label); else btn.removeAttribute('aria-label');
      if (o.testId) btn.setAttribute('data-testid', o.testId); else btn.removeAttribute('data-testid');
      btn.innerHTML = ''; btn.appendChild(h('span', 'bhs__val', o.triggerText || (cur ? cur.label : (o.placeholder || 'Bitte wählen'))));
      if (!o.triggerText) btn.insertAdjacentHTML('beforeend', CHEV);
    }
    function filter() {
      const t = q.trim().toLowerCase();
      shown = o.options.filter((x) => (x.label + ' ' + (x.hint || '')).toLowerCase().includes(t)).sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0));
    }
    const enabled = () => shown.map((x, i) => (x.disabled ? -1 : i)).filter((i) => i >= 0);
    function drawList() {
      filter(); list.innerHTML = '';
      if (!shown.length) list.appendChild(h('div', 'bhs__none', 'Keine Treffer'));
      shown.forEach((x, i) => {
        const b = h('button', 'bhs__opt' + (x.disabled ? ' is-disabled' : '')); b.type = 'button'; b.id = id + '-o' + i;
        b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(x.value === o.value));
        if (x.disabled) b.setAttribute('aria-disabled', 'true');
        b.appendChild(h('span', '', x.label)); if (x.hint) b.appendChild(h('small', '', x.hint));
        b.addEventListener('mouseenter', () => { if (!x.disabled) { act = i; mark(false); } });
        b.addEventListener('click', () => pick(x));
        list.appendChild(b);
      });
      mark(true);
    }
    function mark(scroll) {
      list.querySelectorAll('.bhs__opt').forEach((b, i) => { b.classList.toggle('is-active', i === act); b.setAttribute('data-act', i === act ? '1' : '0'); });
      const el = list.children[act]; if (input && el && el.id) input.setAttribute('aria-activedescendant', el.id);
      if (scroll && el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
    function place() {
      const r = btn.getBoundingClientRect(), vh = window.innerHeight, below = vh - r.bottom - 12, above = r.top - 12;
      const up = below < 240 && above > below, room = Math.max(160, up ? above : below);
      const w = Math.max(r.width, 240), left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      pop.style.left = left + 'px'; pop.style.width = w + 'px'; pop.style.setProperty('--bhs-max', Math.min(360, room) + 'px');
      pop.style.top = up ? 'auto' : r.bottom + 4 + 'px'; pop.style.bottom = up ? vh - r.top + 4 + 'px' : 'auto';
    }
    const onDoc = (e) => { if (!btn.contains(e.target) && !pop.contains(e.target)) close(false); };
    const onMove = (e) => { if (!(e && e.target && pop && pop.contains(e.target))) place(); };
    function openIt() {
      if (isOpen || o.disabled) return;
      isOpen = true; q = ''; act = Math.max(0, o.options.filter((x) => !x.disabled).findIndex((x) => x.value === o.value));
      scrim = h('div', 'bhs__scrim'); pop = h('div', 'bhs__pop'); pop.tabIndex = -1;
      if (searchable()) {
        input = h('input', 'bhs__search'); input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', id + '-l');
        input.setAttribute('aria-label', 'Suchen'); input.placeholder = o.searchPlaceholder || 'Suchen …'; input.autocomplete = 'off';
        input.addEventListener('input', () => { q = input.value; act = 0; drawList(); }); pop.appendChild(input);
      }
      list = h('div', 'bhs__list'); list.id = id + '-l'; list.setAttribute('role', 'listbox'); if (o.label) list.setAttribute('aria-label', o.label); pop.appendChild(list);
      pop.addEventListener('keydown', onKey); document.body.appendChild(scrim); document.body.appendChild(pop);
      document.addEventListener('mousedown', onDoc); window.addEventListener('resize', onMove); window.addEventListener('scroll', onMove, true);
      drawList(); place(); drawBtn(); (input || pop).focus();
    }
    function close(refocus) {
      if (!isOpen) return; isOpen = false;
      document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true);
      if (pop) pop.remove(); if (scrim) scrim.remove(); pop = list = input = scrim = null; drawBtn(); if (refocus) btn.focus();
    }
    function pick(x) { if (!x || x.disabled) return; close(true); if (o.onChange) o.onChange(x.value); }
    function typeAhead(ch) {
      buf += ch.toLowerCase(); clearTimeout(bufT); bufT = setTimeout(() => { buf = ''; }, 600);
      const i = shown.findIndex((x) => !x.disabled && x.label.toLowerCase().startsWith(buf)); if (i >= 0) { act = i; mark(true); }
    }
    function onKey(e) {
      const en = enabled();
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close(false);
      else if (e.key === 'ArrowDown') { e.preventDefault(); const n = en.find((i) => i > act); act = n == null ? en[0] || 0 : n; mark(true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); const p = [...en].reverse().find((i) => i < act); act = p == null ? en[en.length - 1] || 0 : p; mark(true); }
      else if (e.key === 'Home' && !input) { e.preventDefault(); act = en[0] || 0; mark(true); }
      else if (e.key === 'End' && !input) { e.preventDefault(); act = en[en.length - 1] || 0; mark(true); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(shown[act] && !shown[act].disabled ? shown[act] : shown[en[0]]); }
      else if (!input && e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.key !== ' ') typeAhead(e.key);
    }
    btn.addEventListener('click', () => (isOpen ? close(true) : openIt()));
    btn.addEventListener('keydown', (e) => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isOpen) { e.preventDefault(); openIt(); } });
    drawBtn();
    return {
      update(next) { o = Object.assign(o, next); drawBtn(); if (isOpen && !o.disabled) drawList(); else if (isOpen) close(false); },
      destroy() { close(false); clearTimeout(bufT); host.innerHTML = ''; host.classList.remove('bhs'); },
    };
  }
  /** Vanilla pages: <div data-bh-select data-options='[{"value":"","label":"Alle"}]' data-value="" data-label="Status"></div>
   *  -> host.value + bubbling 'change' event like the native element. */
  function mountAll(root) {
    (root || document).querySelectorAll('[data-bh-select]').forEach((hostEl) => {
      if (hostEl._bhs) return;
      let opts = []; try { opts = JSON.parse(hostEl.dataset.options || '[]'); } catch (e) { opts = []; }
      hostEl.value = hostEl.dataset.value || '';
      hostEl._bhs = create(hostEl, { options: opts, value: hostEl.value, label: hostEl.dataset.label, placeholder: hostEl.dataset.placeholder, size: hostEl.dataset.size,
        onChange: (v) => { hostEl.value = v; hostEl._bhs.update({ value: v }); hostEl.dispatchEvent(new Event('change', { bubbles: true })); } });
    });
  }
  window.BHSelectCore = { create, mountAll, SEARCH_FROM };
})();
