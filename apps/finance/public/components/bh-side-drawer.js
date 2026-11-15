'use strict';
/**
 * BHSideDrawer — draggable detail panel on the right. The list stays visible: from 1100 px the page makes room, up to 720 px
 * the panel is a full-screen page with "Zurück". Drag width at the left edge (arrow keys ±24 px, 400 px to 75 %), remembered per storageKey.
 * Esc and the close button close it; focus moves into the panel and back afterwards.
 *   BHSideDrawer.open({ title, body, label, storageKey, onClose, prev, next, position })
 *   BHSideDrawer.update({ title, body, prev, next, position }) · BHSideDrawer.close({ silent }) · BHSideDrawer.isOpen()
 * title and body are HTML, the caller escapes its data.
 */
var BHSideDrawerModul = (typeof window !== 'undefined' && window.BHSideDrawer) ? window.BHSideDrawer : (() => {
  const CSS = `
.bh-sd-panel { position: fixed; top: var(--bh-sd-top); right: 0; bottom: 0; z-index: 800; width: min(var(--bh-sd-width), 100%); box-sizing: border-box;
  display: flex; flex-direction: column; background: var(--bh-surface); border-left: 1px solid var(--bh-border); box-shadow: -12px 0 32px rgba(15, 23, 42, .12); }
@media (min-width: 1100px) { body.bh-sd-open #bhs-main { padding-right: min(var(--bh-sd-width), 60vw); } }
.bh-sd-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px 22px; border-bottom: 1px solid var(--bh-border); }
.bh-sd-title { flex: 1; min-width: 0; margin: 0; font-size: 18px; font-weight: 700; color: var(--bh-text); display: flex; align-items: center; flex-wrap: wrap; gap: 8px; overflow-wrap: anywhere; }
.bh-sd-tools { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.bh-sd-pos { font-size: 12px; color: var(--bh-muted); margin-right: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bh-sd-icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--bh-text); cursor: pointer; }
.bh-sd-icon:hover:not([disabled]) { background: var(--bh-bg-subtle); color: var(--bh-primary); }
.bh-sd-icon[disabled] { color: var(--bh-muted); opacity: .45; cursor: default; }
.bh-sd-icon:focus-visible, .bh-sd-back:focus-visible { outline: 2px solid var(--bh-primary); outline-offset: 1px; }
.bh-sd-back { display: none; align-items: center; gap: 4px; padding: 6px 8px 6px 2px; border: 0; background: none; color: var(--bh-primary); font: inherit; font-weight: 600; cursor: pointer; }
.bh-sd-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 18px 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.bh-sd-grip { position: absolute; top: 0; bottom: 0; left: -5px; width: 10px; cursor: col-resize; z-index: 2; touch-action: none; }
.bh-sd-grip::after { content: ''; position: absolute; top: 50%; left: 3px; width: 4px; height: 44px; margin-top: -22px; border-radius: 4px; background: var(--bh-border-mid); opacity: 0; transition: opacity .15s; }
.bh-sd-grip:hover::after, .bh-sd-grip:focus-visible::after, .bh-sd-resizing .bh-sd-grip::after { opacity: 1; }
.bh-sd-resizing, .bh-sd-resizing * { cursor: col-resize; user-select: none; }
@media (max-width: 720px) {
  .bh-sd-panel { top: 0; width: 100%; border-left: 0; box-shadow: none; z-index: 950; }
  .bh-sd-grip, .bh-sd-close, .bh-sd-pos { display: none; }
  .bh-sd-back { display: inline-flex; }
  .bh-sd-head { flex-wrap: wrap; padding: 10px 12px; }
  .bh-sd-title { order: 3; flex-basis: 100%; font-size: 17px; }
  .bh-sd-tools { margin-left: auto; }
  .bh-sd-body { padding: 14px 16px calc(24px + env(safe-area-inset-bottom)); }
  body.bh-sd-open { overflow: hidden; }
}`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MIN = 400; const DEFAULT = 480; const STEP = 24;
  const maxWidth = () => Math.max(MIN, Math.round(window.innerWidth * 0.75));
  const clamp = (w) => Math.max(MIN, Math.min(maxWidth(), Math.round(w)));
  const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = { close: svg('<path d="M18 6L6 18M6 6l12 12"/>'), up: svg('<path d="M18 15l-6-6-6 6"/>'), down: svg('<path d="M6 9l6 6 6-6"/>'), back: svg('<path d="M15 18l-6-6 6-6"/>') };
  let el = null; let opts = {}; let lastFocus = null; let width = DEFAULT;

  function injectCss() {
    if (document.getElementById('bh-side-drawer-css')) return;
    const style = document.createElement('style');
    style.id = 'bh-side-drawer-css'; style.textContent = CSS;
    document.head.appendChild(style);
  }
  const load = (key) => { try { const n = Number(localStorage.getItem(key)); return n ? clamp(n) : clamp(DEFAULT); } catch { return clamp(DEFAULT); } };
  const save = (key, w) => { try { localStorage.setItem(key, String(w)); } catch { /* private mode: only until closed */ } };
  const apply = () => document.documentElement.style.setProperty('--bh-sd-width', `${width}px`);

  function head() {
    const nav = (dir, fn, label) => `<button type="button" class="bh-sd-icon" data-bhsd="${dir}" aria-label="${label}" title="${label}"${fn ? '' : ' disabled'}>${ICON[dir]}</button>`;
    return `<header class="bh-sd-head"><button type="button" class="bh-sd-back" data-bhsd="close">${ICON.back}<span>Zurück</span></button>`
      + `<h2 class="bh-sd-title" id="bh-sd-title">${opts.title || ''}</h2><div class="bh-sd-tools">${opts.position ? `<span class="bh-sd-pos">${esc(opts.position)}</span>` : ''}`
      + `${nav('up', opts.prev, 'Vorheriger Eintrag')}${nav('down', opts.next, 'Nächster Eintrag')}`
      + `<button type="button" class="bh-sd-icon bh-sd-close" data-bhsd="close" aria-label="Schließen" title="Schließen (Esc)">${ICON.close}</button></div></header>`;
  }

  function draw() {
    el.innerHTML = `<div class="bh-sd-grip" role="separator" aria-orientation="vertical" aria-label="Breite ändern" tabindex="0"></div>${head()}<div class="bh-sd-body">${opts.body || ''}</div>`;
    bindGrip(el.querySelector('.bh-sd-grip'));
  }

  function bindGrip(grip) {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); document.body.classList.add('bh-sd-resizing');
      const move = (ev) => { width = clamp(window.innerWidth - ev.clientX); apply(); };
      const up = () => { grip.removeEventListener('pointermove', move); document.body.classList.remove('bh-sd-resizing'); save(opts.storageKey, width); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });
    grip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); width = clamp(width + (e.key === 'ArrowLeft' ? STEP : -STEP)); apply(); save(opts.storageKey, width);
    });
  }

  function onClick(e) {
    const b = e.target.closest('[data-bhsd]');
    if (!b || b.disabled) return;
    if (b.dataset.bhsd === 'close') close();
    else if (b.dataset.bhsd === 'up' && opts.prev) opts.prev();
    else if (b.dataset.bhsd === 'down' && opts.next) opts.next();
  }
  function onKey(e) {
    if (e.key === 'Escape' && el && !e.defaultPrevented && !document.querySelector('.bh-modal-backdrop')) { e.preventDefault(); close(); }
  }

  function open(o) {
    const wasOpen = !!el;
    opts = { storageKey: 'bh-side-drawer-width', ...o };
    if (!wasOpen) {
      injectCss();
      lastFocus = document.activeElement;
      width = load(opts.storageKey); apply();
      el = document.createElement('aside');
      el.className = 'bh-sd-panel';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-labelledby', 'bh-sd-title');
      el.addEventListener('click', onClick);
      document.body.appendChild(el);
      document.addEventListener('keydown', onKey);
      document.body.classList.add('bh-sd-open');
    }
    if (opts.label) el.setAttribute('aria-label', opts.label);
    draw();
    const focus = el.querySelector(window.matchMedia('(max-width: 720px)').matches ? '.bh-sd-back' : '.bh-sd-close');
    if (focus) focus.focus({ preventScroll: true });
  }

  function update(o) {
    if (!el) return open(o);
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.bhsd : null;
    opts = { ...opts, ...o };
    draw();
    const again = active && el.querySelector(`[data-bhsd="${active}"]:not([disabled])`);
    (again || el.querySelector('.bh-sd-close')).focus({ preventScroll: true });
    return undefined;
  }

  function close({ silent = false } = {}) {
    if (!el) return;
    el.remove(); el = null;
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('bh-sd-open');
    const cb = opts.onClose; opts = {};
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (!silent && cb) cb();
  }

  return { open, update, close, isOpen: () => !!el, MIN };
})();
if (typeof window !== 'undefined') window.BHSideDrawer = BHSideDrawerModul;
