// Zaehlt Fehlversuche je Schluessel im Speicher; fuer einen einzelnen Dienst genuegt das.
export function rateLimiter({ max = 8, windowMs = 15 * 60_000, now = Date.now } = {}) {
  const hits = new Map();
  const live = (key) => {
    const e = hits.get(key);
    if (e && now() - e.start > windowMs) { hits.delete(key); return null; }
    return e || null;
  };
  return {
    blocked: (key) => (live(key)?.count || 0) >= max,
    fail(key) { const e = live(key); if (e) e.count++; else hits.set(key, { start: now(), count: 1 }); },
    reset: (key) => hits.delete(key),
  };
}
