'use strict';
/**
 * Read-only client of the finance app (apps/finance, /api/external/finance). The key has the scope "finance" and
 * belongs to a person with finance access; the gateway offers these tools only to people listed in servers.json.
 * Amounts come in cents and leave in euros, so the assistant can read them out directly.
 */
const BASE = () => (process.env.BH_FINANCE_URL || '').replace(/\/$/, '');

/** Every "*_cents" field and the known money fields become euros (2 decimals). */
function euros(v, key = '') {
  if (Array.isArray(v)) return v.map((x) => euros(x, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/_cents$/, '_eur'), euros(x, k)]));
  const money = /_cents$/.test(key) || ['total', 'previous', 'budget', 'cents', 'cumulative', 'income', 'spending', 'result', 'invested', 'reserved', 'externIn', 'externOut', 'amount', 'balance', 'annuity', 'marketValue', 'rentYear', 'interest', 'principal', 'paid'].includes(key);
  return money && typeof v === 'number' ? Math.round(v) / 100 : v;
}

async function get(path, query = {}) {
  if (!BASE() || !process.env.BH_FINANCE_KEY) throw new Error('Finanz-Werkzeuge sind nicht eingerichtet (BH_FINANCE_URL/BH_FINANCE_KEY fehlen).');
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(`${BASE()}/api/external/finance${path}${qs.toString() ? `?${qs}` : ''}`, { headers: { authorization: `Bearer ${process.env.BH_FINANCE_KEY}` }, signal: AbortSignal.timeout(20_000) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new Error('Kein Zugang zu den Finanzen (Schlüssel gesperrt oder ohne Freigabe).');
  if (!r.ok) throw new Error(data.error || `Finanzen antworten mit ${r.status}`);
  return euros(data);
}

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });

module.exports = { get, euros, text };
