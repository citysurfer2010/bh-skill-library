'use strict';
/**
 * Hinweis „Neue Version verfügbar“. Pollt {BASE}api/build-id alle 60 s; bei Änderung erscheint unten rechts ein nicht-blockierender
 * Toast. Kein Auto-Reload, damit niemand mitten im Tippen rausgerissen wird. BASE kommt aus der eigenen Script-URL, doppeltes Laden
 * registriert nur einmal. „Aktualisieren“ leert Cache und Service Worker und lädt mit Cache-Buster neu.
 */
(function () {
  if (window.__buildCheckInstalled) return;
  window.__buildCheckInstalled = true;

  const POLL_MS = 60_000;

  // wird unter /dms/build-version-check.js geladen → BASE = /dms/.
  function getBase() {
    const me = document.currentScript;
    if (me && me.src) {
      try {
        const u = new URL(me.src, window.location.origin);
        const parts = u.pathname.split('/').filter(Boolean);
        parts.pop(); // build-version-check.js entfernen
        return parts.length ? '/' + parts.join('/') + '/' : '/';
      } catch (_) { /* fallthrough */ }
    }
    // Fallback: erster Path-Segment der aktuellen URL als Gateway-Prefix
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

  // Echter Hard-Reload: Cache API leeren, Service Worker abmelden, mit Cache-Buster neu navigieren.
  // alte Bundles, auch wenn der Server schon das neue ausliefert.
  async function forceHardReload() {
    try {
      if (typeof caches !== 'undefined' && caches && typeof caches.keys === 'function') {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (_) { /* nicht blockieren — Cache-API kann in Insecure-Contexts fehlen */ }
    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (_) { /* dito */ }

    const loc   = window.location;
    const buster = latestBuildId || String(Date.now());
    // Bestehenden _v=… aus der Query rausstrippen — sonst stackt der Param
    // bei jedem Update (?_v=A&_v=B&_v=C …).
    const cleanSearch = (loc.search || '')
      .replace(/(?:^\?|&)_v=[^&]*/g, '')
      .replace(/^&/, '?')
      .replace(/^\?$/, '');
    const sep = cleanSearch ? (cleanSearch.startsWith('?') ? '&' : '?') : '?';
    const target = loc.pathname + cleanSearch + sep + '_v=' + encodeURIComponent(buster) + (loc.hash || '');
    // replace statt assign: kein History-Back zur Vor-Update-Version
    // (sonst klickt User „zurück" und kriegt wieder die alte URL ohne _v).
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
    // Bei Tab-Wiederfokus: Sofort-Check, falls der User den Tab lange
    // im Hintergrund hatte (Browser drosseln dann setInterval).
    window.addEventListener('focus', tick);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
