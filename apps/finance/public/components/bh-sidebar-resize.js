'use strict';
/**
 * BHSidebarResize — draggable width of the left sidebar. attach(el, { key, min = 180, max = 420, side = 'left' }).
 * Drag with mouse/touch, arrow keys ±16 px, double click = default width. Inactive when .collapsed and up to 900 px. Idempotent.
 */
window.BHSidebarResize = (() => {
  const STEP = 16;
  const CSS = `.bh-sbr-handle{position:absolute;top:0;bottom:0;width:6px;cursor:col-resize;z-index:5;touch-action:none;background:transparent;transition:background .12s}
.bh-sbr-handle[data-side=left]{right:0}.bh-sbr-handle[data-side=right]{left:0}
.bh-sbr-handle:hover,.bh-sbr-handle:focus-visible,.bh-sbr-handle.dragging{background:var(--bh-primary-border);outline:none}
.collapsed>.bh-sbr-handle{display:none}@media (max-width:900px){.bh-sbr-handle{display:none}}
body.bh-sbr-dragging{cursor:col-resize;user-select:none}body.bh-sbr-dragging *{transition:none!important}`;

  function injectCss() {
    if (document.getElementById('bh-sbr-css')) return;
    const st = document.createElement('style');
    st.id = 'bh-sbr-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const read = (key) => { try { return Number(localStorage.getItem(key)) || null; } catch (_) { return null; } };
  const write = (key, w) => { try { localStorage.setItem(key, String(w)); } catch (_) { /* private mode: width lasts for this page */ } };

  function attach(el, { key, min = 180, max = 420, side = 'left' } = {}) {
    if (!el || el.querySelector(':scope > .bh-sbr-handle')) return;
    injectCss();
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const clamp = (w) => Math.max(min, Math.min(max, Math.round(w)));
    const apply = (w) => { el.style.setProperty('--bh-sb-width', `${clamp(w)}px`); };
    const saved = key ? read(key) : null;
    if (saved) apply(saved);
    const handle = document.createElement('div');
    handle.className = 'bh-sbr-handle';
    handle.dataset.side = side;
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Breite der Seitenleiste ändern');
    handle.title = 'Ziehen zum Ändern der Breite · Doppelklick: Standardbreite';
    el.appendChild(handle);
    // Last set width first: the rendered width lags behind during the transition.
    const current = () => parseFloat(el.style.getPropertyValue('--bh-sb-width')) || el.getBoundingClientRect().width;
    const done = () => { if (key) write(key, clamp(current())); };

    handle.addEventListener('pointerdown', (e) => {
      if (el.classList.contains('collapsed')) return;
      e.preventDefault();
      const startX = e.clientX; const startW = current();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging'); document.body.classList.add('bh-sbr-dragging');
      const move = (ev) => apply(startW + (side === 'left' ? ev.clientX - startX : startX - ev.clientX));
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        handle.classList.remove('dragging'); document.body.classList.remove('bh-sbr-dragging');
        done();
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const grow = (e.key === 'ArrowRight') === (side === 'left');
      apply(current() + (grow ? STEP : -STEP)); done();
    });
    handle.addEventListener('dblclick', () => { el.style.removeProperty('--bh-sb-width'); if (key) { try { localStorage.removeItem(key); } catch (_) { /* ignore */ } } });
  }

  return { attach };
})();
