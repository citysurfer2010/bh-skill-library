'use strict';
/**
 * Loans of the flats (Finanzen → Kredite), redesigned 22.11.2026 ("die Seite nochmal mit besserer UX designen"):
 * search and filters in the address (?q=, ?owner=, ?bank=, ?status=) like the flats page; KPIs follow the filter;
 * expiring loans named in the callout; each loan with a repayment bar; closed loans apart (collapsed); one table per
 * year with interest, repayment, paid and the year-end balance instead of one column per loan; the year-end balances
 * of a single loan in a dialog ("Verlauf").
 */
window.FinLoans = (() => {
  const { esc, euro, date, BASE } = Fin;
  const street = (a) => { const p = String(a).split(',').map((s) => s.trim()); return p.length > 2 ? p.slice(2).join(', ') : a; };
  const city = (a) => String(a).split(',').map((s) => s.trim())[1] || '';
  const monthsTo = (d) => (d ? (Date.parse(`${d}T12:00:00Z`) - Date.now()) / (30.44 * 86_400_000) : Infinity);
  const pct = (v) => `${Math.round(v).toLocaleString('de-DE')} %`;
  const KEYS = ['q', 'owner', 'bank', 'status'];
  const Y = new Date().getFullYear();
  let data = null; let host = null;

  const left = (l) => l.balance_now_cents ?? l.balance_cents ?? 0;
  const closed = (l) => left(l) <= 0;
  const soon = (l) => !closed(l) && monthsTo(l.ends_on) <= 18;
  const name = (l) => `${street(l.address)} · ${l.unit}`;
  const repaid = (l) => (l.amount_cents > 0 ? Math.min(100, Math.max(0, (1 - left(l) / l.amount_cents) * 100)) : null);

  const params = () => { const q = new URLSearchParams(location.search); return Object.fromEntries(KEYS.map((k) => [k, q.get(k) || ''])); };
  function setParam(key, value) {
    const q = new URLSearchParams(location.search); if (value) q.set(key, value); else q.delete(key);
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`); draw();
  }
  function filtered() {
    const p = params(); const words = p.q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.loans.filter((l) => (!p.owner || l.owner === p.owner) && (!p.bank || l.lender === p.bank)
      && (!p.status || (p.status === 'bald' ? soon(l) : p.status === 'laufend' ? !closed(l) : closed(l)))
      && words.every((w) => `${l.address} ${l.unit} ${l.owner} ${l.lender} ${l.iban} ${l.ref}`.toLowerCase().includes(w)));
  }

  function kpis(list) {
    const open = list.filter((l) => !closed(l)); const sum = (k) => open.reduce((s, l) => s + (l[k] || 0), 0);
    const balance = open.reduce((s, l) => s + left(l), 0); const amount = sum('amount_cents');
    const value = [...new Map(open.map((l) => [l.unit_key, l.market_value_cents || 0])).values()].reduce((a, b) => a + b, 0);
    const last = data.years.find((y) => y.year === Y - 1);
    return AppShell.kpis([
      { label: 'Restschuld', value: euro(balance), sub: amount ? `${pct((1 - balance / amount) * 100)} getilgt von ${euro(amount)}` : `${open.length} Darlehen` },
      { label: 'Rate je Monat', value: euro(sum('annuity_cents')), sub: `${euro(sum('annuity_cents') * 12)} im Jahr · ${open.length} Darlehen` },
      { label: 'Beleihung', value: value ? pct((balance / value) * 100) : '–', sub: 'Restschuld zum Marktwert der Wohnungen' },
      { label: `Zinsen ${Y - 1}`, value: last ? euro(last.interest) : '–', sub: last ? `Tilgung ${euro(last.principal)}` : 'keine Bankdaten' },
    ]);
  }

  function callout(list) {
    const s = list.filter(soon).sort((a, b) => String(a.ends_on).localeCompare(String(b.ends_on)));
    if (!s.length) return '';
    return `<section class="fin-loans-soon" aria-label="Darlehen, die bald auslaufen"><strong>Anschlussfinanzierung klären:</strong> ${s.length === 1 ? 'ein Darlehen läuft' : `${s.length} Darlehen laufen`} in den nächsten 18 Monaten aus.
      <ul>${s.map((l) => `<li><span class="fin-num">${esc(date(l.ends_on))}</span> · ${esc(name(l))} · ${esc(l.lender || '–')} · Restschuld <span class="fin-num">${esc(euro(left(l)))}</span></li>`).join('')}</ul></section>`;
  }

  // Small links under the flat's name (no own column: keeps the rows low and the table inside the page).
  const actions = (l) => [
    l.history?.length ? `<button type="button" class="fin-link-btn" data-history="${esc(String(l.id))}" aria-label="Verlauf der Restschuld ${esc(name(l))}">Verlauf</button>` : '',
    l.ref && Object.keys(l.years).length ? `<a href="${BASE}/all/transactions?scope=all&amp;q=${encodeURIComponent(l.ref)}" aria-label="Buchungen zum Darlehen ${esc(name(l))}">Buchungen</a>` : '',
    l.docs_url ? `<a href="${esc(l.docs_url)}" target="_blank" rel="noopener noreferrer" aria-label="Unterlagen zum Darlehen ${esc(name(l))} (Google Drive)">Unterlagen</a>` : '',
  ].filter(Boolean).join('');

  function table(rows, { title = '', empty = 'Kein Darlehen passt zu Suche und Filter.', key = 'fin-loans2' } = {}) {
    return AppShell.list({ title, storageKey: key, className: 'fin-loan-list', columns: [
      { key: 'address', label: 'Wohnung', sortValue: (l) => `${street(l.address)} ${l.unit} ${l.position}`, html: (l) => { const a = actions(l); return `<strong class="fin-nowrap">${esc(name(l))}</strong><div class="fin-hint">${esc(city(l.address))}${l.owner ? ` · ${esc(l.owner)}` : ''}${l.position > 1 ? ` · ${l.position}. Darlehen` : ''}</div>${a ? `<div class="fin-loan-actions">${a}</div>` : ''}`; } },
      { key: 'lender', label: 'Darlehen', html: (l) => `${esc(l.lender || '–')}<div class="fin-hint">${[l.iban ? `Konto ${esc(l.iban)}` : '', l.rate_pct != null ? `${esc(l.rate_pct.toLocaleString('de-DE'))} % Zins${l.rate_source === 'sheet' ? ' (laut Tabelle)' : ''}` : ''].filter(Boolean).join(' · ')}</div>` },
      { key: 'balance', label: 'Restschuld', align: 'right', sortValue: (l) => left(l), html: (l) => {
        const r = repaid(l); const src = l.bank_balance ? `Kontoauszug ${date(l.bank_balance.on)}, Tilgung seitdem abgezogen` : 'laut Portfolioübersicht';
        return `<span class="fin-num" title="${esc(src)}">${esc(euro(left(l)))}</span>${r == null ? '' : `<div class="fin-progress" role="img" aria-label="${esc(pct(r))} getilgt"><span data-p="${Math.round(r)}"></span></div><div class="fin-hint">${esc(pct(r))} getilgt von ${esc(euro(l.amount_cents))}</div>`}${l.shared ? `<div class="fin-hint">Anteil, 1 Darlehen für ${l.shared} Wohnungen</div>` : ''}`;
      } },
      { key: 'annuity', label: 'Rate', align: 'right', sortValue: (l) => l.annuity_cents ?? -1, html: (l) => `<span class="fin-num">${esc(euro(l.annuity_cents))}</span>${l.years[Y] ? `<div class="fin-hint fin-nowrap">Zins ${Y}: ${esc(euro(l.years[Y].interest))}</div><div class="fin-hint fin-nowrap">Tilgung ${Y}: ${esc(euro(l.years[Y].principal))}</div>` : ''}` },
      { key: 'ends_on', label: 'Läuft bis', sortValue: (l) => l.ends_on || '9999', html: (l) => (l.ends_on ? `<span class="fin-num">${esc(date(l.ends_on))}</span>${closed(l) ? ' <span class="fin-badge">abgelöst</span>' : monthsTo(l.ends_on) < 0 ? ' <span class="fin-badge fin-badge-warn">abgelaufen</span>' : soon(l) ? ' <span class="fin-badge fin-badge-warn">bald</span>' : ''}` : '–') },
    ], rows, empty });
  }

  function years() {
    if (!data.years.length) return '';
    // Year-end balance: sum of the loans' statements at that year's end (only loans with a statement for it).
    const end = (y) => { let s = 0; let n = 0; for (const l of data.loans) { const h = [...(l.history || [])].reverse().find((x) => x.on.slice(0, 4) === String(y)); if (h) { s += h.cents; n += 1; } } return { s, n }; };
    const withEnd = data.years.some((r) => end(r.year).n);
    return AppShell.list({ title: 'Über die Jahre', className: `fin-years-list${withEnd ? ' fin-years-end' : ''}`, columns: [
      { key: 'year', label: 'Jahr' },
      { key: 'interest', label: 'Zinsen', align: 'right', html: (r) => `<span class="fin-num">${esc(euro(r.interest))}</span>` },
      { key: 'principal', label: 'Tilgung', align: 'right', html: (r) => `<span class="fin-num">${esc(euro(r.principal))}</span>` },
      { key: 'paid', label: 'Gezahlt', align: 'right', html: (r) => `<span class="fin-num">${esc(euro(r.paid))}</span>` },
    ].concat(withEnd ? [{ key: 'end', label: 'Restschuld Jahresende', align: 'right', html: (r) => { const e = end(r.year); return e.n ? `<span class="fin-num">${esc(euro(e.s))}</span><div class="fin-hint">aus ${e.n} Kontoauszügen</div>` : '–'; } }] : []), rows: data.years });
  }

  function showHistory(id) {
    const l = data.loans.find((x) => String(x.id) === String(id)); if (!l) return;
    const rows = [...l.history].reverse();
    BHModal.open({ title: `Restschuld ${esc(name(l))}`, submitLabel: 'Schließen',
      body: `<p class="fin-hint">${esc(l.lender || '')} · laut Kontoauszügen der Bank</p>${AppShell.list({ className: 'fin-history-list', columns: [
        { key: 'on', label: 'Stand', html: (h) => `<span class="fin-num">${esc(date(h.on))}</span>` },
        { key: 'cents', label: 'Restschuld', align: 'right', html: (h) => `<span class="fin-num">${esc(euro(h.cents))}</span>` },
      ], rows })}`,
      onSubmit: () => {} });
  }

  function draw() {
    const list = filtered(); const p = params();
    const open = list.filter((l) => !closed(l)); const done = list.filter(closed);
    host.querySelector('[data-kpis]').innerHTML = kpis(list);
    host.querySelector('[data-soon]').innerHTML = callout(list);
    host.querySelector('[data-list]').innerHTML = table(open, { empty: data.loans.length ? 'Kein laufendes Darlehen passt zu Suche und Filter.' : 'Noch keine Kredite. Sie kommen aus der Portfolioübersicht.' })
      + (done.length ? `<details class="fin-loans-closed"${p.status === 'abgeloest' ? ' open' : ''}><summary>Abgelöste und abbezahlte Darlehen (${done.length})</summary>${table(done, { key: 'fin-loans2-closed' })}</details>` : '');
    host.querySelector('[data-count]').textContent = `${open.length} laufende Darlehen${done.length ? `, ${done.length} abgelöst` : ''}`;
    host.querySelector('[data-reset]').hidden = !KEYS.some((k) => p[k]);
    host.querySelectorAll('[data-filter]').forEach((el) => el.classList.toggle('is-on', !!p[el.dataset.filter]));
    host.querySelectorAll('.fin-progress span').forEach((s) => s.style.setProperty('--fin-p', `${s.dataset.p}%`));
    host.querySelectorAll('[data-history]').forEach((b) => b.addEventListener('click', () => showHistory(b.dataset.history)));
  }

  async function render(h) {
    host = h; data = await Fin.api('GET', '/loans'); const p = params();
    AppShell.render(host, `<header class="app-topbar"><div><h1>Kredite</h1><div class="sub">Darlehen der Wohnungen. Stammdaten aus der Portfolioübersicht${data.asOf ? ` (Stand ${esc(date(data.asOf))})` : ''}, Restschuld aus den Kontoauszügen, Zins und Tilgung aus den Bankbuchungen.</div></div>
      <div class="app-topbar-actions"><label class="bhlp-search fin-estate-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="search" data-q placeholder="Wohnung, Bank, Konto …" aria-label="Darlehen suchen" value="${esc(p.q)}"></label></div></header>
      <div data-kpis></div><div data-soon></div>
      <div class="fin-estate-bar"><strong data-count></strong><div class="fin-filters" role="group" aria-label="Filter"><div class="fin-acc-filter" data-filter="owner"></div><div class="fin-acc-filter" data-filter="bank"></div><div class="fin-acc-filter" data-filter="status"></div>
      <button type="button" class="bh-btn bh-btn-sm fin-reset" data-reset hidden>Filter zurücksetzen</button></div></div>
      <div data-list></div>
      ${years()}
      ${data.unmatched ? `<p class="fin-hint">${data.unmatched} Darlehensbuchungen gehören zu keinem Darlehen (z. B. fehlendes Darlehenskonto in der Portfolioübersicht).</p>` : ''}`);
    const uniq = (f) => [...new Set(data.loans.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    const mount = (key, label, options) => { const el = host.querySelector(`[data-filter="${key}"]`); const pick = BHSelectCore.create(el, { options, value: p[key], label, searchPlaceholder: `${label} suchen …`, onChange: (v) => { pick.update({ value: v }); setParam(key, v); } }); };
    mount('owner', 'Eigentümer', [{ value: '', label: 'Alle Eigentümer' }].concat(uniq((l) => l.owner).map((o) => ({ value: o, label: o }))));
    mount('bank', 'Bank', [{ value: '', label: 'Alle Banken' }].concat(uniq((l) => l.lender).map((b) => ({ value: b, label: b }))));
    mount('status', 'Status', [{ value: '', label: 'Alle Darlehen' }, { value: 'laufend', label: 'Laufend' }, { value: 'bald', label: 'Läuft bald aus' }, { value: 'abgeloest', label: 'Abgelöst' }]);
    let t = null; host.querySelector('[data-q]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => setParam('q', e.target.value.trim()), 200); });
    host.querySelector('[data-reset]').addEventListener('click', () => { history.replaceState(null, '', location.pathname); render(host); });
    draw();
  }

  return { render };
})();
