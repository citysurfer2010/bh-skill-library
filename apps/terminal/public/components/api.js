'use strict';
/**
 * HTTP-Client für Terminal. Alle Pfade mit window.APP_BASE als Präfix.
 * me() ist 60 s gecacht, damit die Navbar bei Seitenwechseln sofort steht.
 */
window.TerminalApi = (() => {
  const BASE = (typeof window !== 'undefined' && window.APP_BASE) || '';

  async function req(method, url, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const fullUrl = url.startsWith('/') ? (BASE + url) : url;
    const r = await fetch(fullUrl, opts);
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json().catch(() => null) : null;
    if (!r.ok) {
      const msg = (data && data.error) || `HTTP ${r.status}`;
      const err = new Error(msg); err.status = r.status; err.data = data;
      throw err;
    }
    return data;
  }

  async function me() {
    try {
      const raw = sessionStorage.getItem('terminal-me');
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c._cachedAt && Date.now() - c._cachedAt < 60000) {
          const { _cachedAt, ...user } = c;
          return user;
        }
      }
    } catch {/* cache miss */}
    const fresh = await req('GET', '/api/me');
    try { sessionStorage.setItem('terminal-me', JSON.stringify({ ...fresh, _cachedAt: Date.now() })); } catch {}
    return fresh;
  }

  return { me /* add more endpoints here */ };
})();
