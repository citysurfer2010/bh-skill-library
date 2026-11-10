'use strict';
/**
 * "Neue Version verfügbar" notice. Polls {BASE}api/build-id every 60 s; on a change a non-blocking toast appears
 * bottom right. No auto-reload, so nobody is interrupted mid-typing. BASE comes from the script's own URL, loading it twice
 * registers only once. "Aktualisieren" clears cache and service worker and reloads with a cache buster.
 */
(function () {
  if (window.__buildCheckInstalled) return;
  window.__buildCheckInstalled = true;

  const POLL_MS = 60_000;

  // loaded under /dms/build-version-check.js → BASE = /dms/.
  function getBase() {
    const me = document.currentScript;
    if (me && me.src) {
      try {
        const u = new URL(me.src, window.location.origin);
        const parts = u.pathname.split('/').filter(Boolean);
        parts.pop(); // remove build-version-check.js
        return parts.length ? '/' + parts.join('/') + '/' : '/';
      } catch (_) { /* fallthrough */ }
    }
    // Fallback: first path segment of the current URL as gateway prefix
    const segs = window.location.pathname.split('/').filter(Boolean);
    return segs.length ? '/' + segs[0] + '/' : '/';
  }
  const BASE = getBase();

  let knownBuildId = null;
  let latestBuildId = null;
  let toastEl = null;

  async function fetchBuildId() {
    try {
      const r = await fetch(BASE + 'api/build-id', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.buildId ? String(j.buildId) : null;
    } catch (_) { return null; }
  }

  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  const TOKENS = {
    surface:  'var(--bh-surface)',
    border:   'var(--bh-border)',
    text:     'var(--bh-text)',
    textMut:  'var(--bh-muted)',
    primary:  'var(--bh-primary)',
    primaryD: 'var(--bh-primary-hover)',
  };

  // Real hard reload: clear Cache API, unregister service worker, navigate again with a cache buster.
  // old bundles, even if the server already delivers the new one.
  async function forceHardReload() {
    try {
      if (typeof caches !== 'undefined' && caches && typeof caches.keys === 'function') {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (_) { /* do not block — Cache API may be missing in insecure contexts */ }
    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (_) { /* ditto */ }

    const loc   = window.location;
    const buster = latestBuildId || String(Date.now());
    // Strip any existing _v=… from the query — otherwise the param stacks
    // on every update (?_v=A&_v=B&_v=C …).
    const cleanSearch = (loc.search || '')
      .replace(/(?:^\?|&)_v=[^&]*/g, '')
      .replace(/^&/, '?')
      .replace(/^\?$/, '');
    const sep = cleanSearch ? (cleanSearch.startsWith('?') ? '&' : '?') : '?';
    const target = loc.pathname + cleanSearch + sep + '_v=' + encodeURIComponent(buster) + (loc.hash || '');
    // replace instead of assign: no history back to the pre-update version
    // (otherwise the user clicks "back" and gets the old URL without _v again).
    loc.replace(target);
  }

  function ensureToast() {
    if (toastEl) return toastEl;
    const t = el('div', [
      'position:fixed', 'right:20px', 'bottom:20px', 'z-index:99999',
      'background:' + TOKENS.surface, 'color:' + TOKENS.text,
      'border:1px solid ' + TOKENS.border,
      'border-radius:12px', 'box-shadow:0 12px 32px rgba(0,0,0,.18)',
      'padding:14px 16px',
      'font:13px/1.45 system-ui,-apple-system,sans-serif',
      'display:flex', 'align-items:center', 'gap:12px',
      'max-width:360px',
    ].join(';'));
    t.id = 'bh-build-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');

    const inner = el('div', 'flex:1');
    inner.appendChild(el('div', 'font-weight:600;margin-bottom:2px;color:' + TOKENS.text,
      'Neue Version verfügbar'));
    inner.appendChild(el('div', 'font-size:12px;color:' + TOKENS.textMut,
      'Bitte Seite neu laden, um die aktuelle Version zu nutzen.'));
    t.appendChild(inner);

    const reload = el('button',
      'padding:8px 16px;font-size:13px;font-weight:500;background:' + TOKENS.primary
      + ';color:var(--bh-on-primary);border:none;border-radius:7px;cursor:pointer;white-space:nowrap;'
      + 'font-family:inherit;transition:background .12s',
      'Aktualisieren');
    reload.type = 'button';
    reload.addEventListener('mouseenter', () => { reload.style.background = TOKENS.primaryD; });
    reload.addEventListener('mouseleave', () => { reload.style.background = TOKENS.primary; });
    reload.addEventListener('click', forceHardReload);
    t.appendChild(reload);

    const close = el('button',
      'background:transparent;border:none;font-size:20px;line-height:1;color:'
      + TOKENS.textMut + ';cursor:pointer;padding:0 4px;font-family:inherit',
      '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Schließen');
    close.addEventListener('click', () => { t.remove(); toastEl = null; });
    t.appendChild(close);

    document.body.appendChild(t);
    toastEl = t;
    return t;
  }

  async function tick() {
    const cur = await fetchBuildId();
    if (!cur) return;
    if (knownBuildId === null) { knownBuildId = cur; latestBuildId = cur; return; }
    if (cur !== knownBuildId) { latestBuildId = cur; ensureToast(); }
  }

  function start() {
    tick();
    setInterval(tick, POLL_MS);
    // On tab refocus: immediate check, in case the user had the tab
    // in the background for long (browsers then throttle setInterval).
    window.addEventListener('focus', tick);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
