'use strict';
/**
 * HTTP client for Beamer. All paths prefixed with window.APP_BASE.
 * me() is cached for 60 s so the navbar is ready immediately on page changes.
 */
window.BeamerApi = (() => {
  const BASE = (typeof window !== 'undefined' && window.APP_BASE) || '';

  async function req(method, url, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(BASE + url, opts);
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json().catch(() => null) : null;
    if (!r.ok) throw Object.assign(new Error((data && data.error) || `HTTP ${r.status}`), { status: r.status });
    return data;
  }

  async function me() {
    try {
      const c = JSON.parse(sessionStorage.getItem('beamer-me') || 'null');
      if (c && Date.now() - c._cachedAt < 60000) return c;
    } catch { /* no cache */ }
    const fresh = await req('GET', '/api/me');
    try { sessionStorage.setItem('beamer-me', JSON.stringify({ ...fresh, _cachedAt: Date.now() })); } catch { /* ignore */ }
    return fresh;
  }

  return { me, catalog: () => req('GET', '/api/catalog'), schedule: () => req('GET', '/api/schedule'), status: () => req('GET', '/api/status'), send: (path, body = {}) => req('POST', `/api${path}`, body) };
})();
