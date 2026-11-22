'use strict';
/**
 * Mieten oder Kaufen (Matti 22.11.2026): calculator on the Wohnkosten page. Pure math in calc() (also used by the unit
 * test in Node), the form in render(). Values live in the URL (shareable link); defaults as discussed: 4,5 % interest,
 * 1 % initial repayment, closing costs Berlin 11,57 % (transfer tax 6 %, notary/land register 2 %, broker 3,57 %),
 * the liquid money of the private accounts above the buffer is the equity that could go in. Amounts in euros.
 */
(function () {
  const DEFAULTS = { free: 0, savings: 0, buffer: 0, rent: 3500, rentPower: 150, price: 800000, closing: 11.57, equity: 0, rate: 4.5, repay: 1, hoa: 600, buyPower: 150, repairs: 100 };

  /** today: current housing cost per month (euros). Returns per month and loan figures, all in euros. */
  function calc(input, today = 0) {
    const v = { ...DEFAULTS, ...input };
    const closing = (v.price * v.closing) / 100;
    const loan = Math.max(0, v.price + closing - v.equity);
    const r = v.rate / 100 / 12;
    const annuity = (loan * (v.rate + v.repay)) / 100 / 12;
    const interest = loan * r; const principal = annuity - interest;
    const restAfter = (n) => (r ? loan * (1 + r) ** n - annuity * (((1 + r) ** n - 1) / r) : loan - annuity * n);
    const months = loan === 0 ? 0 : principal <= 0 ? Infinity : r ? Math.log(annuity / (annuity - interest)) / Math.log(1 + r) : loan / annuity;
    const rent = { outflow: v.rent + v.rentPower, cost: v.rent + v.rentPower };
    const buy = { outflow: annuity + v.hoa + v.buyPower + v.repairs, cost: interest + v.hoa + v.buyPower + v.repairs, loan, annuity, interest, principal, closing, rest10: Math.max(0, restAfter(120)), years: months / 12 };
    const room = v.free + v.savings; // what could go into housing: free cash flow after saving plus savings redirected
    for (const x of [rent, buy]) { x.more = x.outflow - today; x.left = room - x.more; }
    return { room, today, rent, buy, cheaper: buy.cost < rent.cost ? 'buy' : 'rent', diff: Math.abs(buy.cost - rent.cost) };
  }

  const FIELDS = [
    ['Haushalt', [['free', 'Freier Cashflow nach Sparen (€ / Monat)', 'Was nach allen Kosten, Tilgung und Sparraten im Schnitt übrig bleibt (kann negativ sein)'], ['savings', 'Sparraten, die ihr umwidmen würdet (€ / Monat)', 'z. B. ETF-Sparplan, Sparen für die Kinder'], ['buffer', 'Puffer für die Wohnungen (€)', 'Für Mietausfall und Reparaturen, wird nicht eingesetzt']]],
    ['Mieten', [['rent', 'Warmmiete (€ / Monat)'], ['rentPower', 'Strom (€ / Monat)']]],
    ['Kaufen', [['price', 'Kaufpreis (€)'], ['closing', 'Kaufnebenkosten (%)', 'Berlin: Grunderwerbsteuer 6 %, Notar/Grundbuch 2 %, Makler 3,57 %'], ['equity', 'Eigenkapital (€)'], ['rate', 'Zins (% p. a.)'], ['repay', 'Anfangstilgung (%)'], ['hoa', 'Hausgeld inkl. Heizung (€ / Monat)'], ['buyPower', 'Strom (€ / Monat)'], ['repairs', 'Eigene Reparaturen (€ / Monat)', 'Was die Rücklage der Gemeinschaft nicht trägt']]],
  ];

  function readUrl() {
    const q = new URLSearchParams(location.search); const v = {};
    for (const k of Object.keys(DEFAULTS)) { const n = Number(String(q.get(k) ?? '').replace(',', '.')); if (q.has(k) && Number.isFinite(n) && (n >= 0 || k === 'free')) v[k] = n; }
    return { ...DEFAULTS, ...v };
  }
  function writeUrl(v) {
    const q = new URLSearchParams(location.search);
    for (const k of Object.keys(DEFAULTS)) { if (v[k] === DEFAULTS[k]) q.delete(k); else q.set(k, String(v[k])); }
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
  }

  function result(host, v, d) {
    const { esc, euro } = Fin; const e = (x) => esc(euro(Math.round(x * 100)));
    const todayMonthly = d.estimate ? -d.estimate.perMonth / 100 : 0;
    const c = calc(v, todayMonthly); const b = c.buy;
    const free = Math.max(0, (d.liquid || 0) / 100 - v.buffer);
    const years = (y) => (Number.isFinite(y) ? `${Math.round(y)} Jahre` : 'nie (Tilgung zu niedrig)');
    const fit = (x) => (x.left >= 0 ? `passt, ${e(x.left)} bleiben` : `fehlt ${e(-x.left)}`);
    const rows = [
      { k: 'Abfluss je Monat', t: e(c.today), r: e(c.rent.outflow), b: e(b.outflow) },
      { k: 'Mehr als heute', t: '–', r: e(c.rent.more), b: e(b.more) },
      { k: 'Im Spielraum?', t: e(c.room), r: esc(fit(c.rent)), b: esc(fit(b)) },
      { k: 'Echte Kosten ohne Tilgung', t: e(c.today), r: e(c.rent.cost), b: e(b.cost) },
      { k: 'Darlehen', t: '–', r: '–', b: e(b.loan) },
      { k: 'Rate (Zins + Tilgung)', t: '–', r: '–', b: `${e(b.annuity)} <span class="fin-hint">(${e(b.interest)} + ${e(b.principal)})</span>` },
      { k: 'Restschuld nach 10 Jahren', t: '–', r: '–', b: e(b.rest10) },
      { k: 'Schuldenfrei nach', t: '–', r: '–', b: esc(years(b.years)) },
      { k: 'Kaufnebenkosten (verloren)', t: '–', r: '–', b: e(b.closing) },
    ];
    const warn = v.equity > free ? `<p class="fin-rb-warn" role="status">Achtung: ${e(v.equity)} Eigenkapital greifen den Puffer an, über dem Puffer sind nur ${e(free)} frei.</p>` : '';
    host.innerHTML = `${warn}<p class="fin-rb-verdict"><strong>${c.cheaper === 'buy' ? 'Kaufen' : 'Mieten'} ist um ${e(c.diff)} im Monat günstiger</strong> (echte Kosten ohne Tilgung). Mieten: ${esc(fit(c.rent))}. Kaufen: ${esc(fit(b))}.</p>
      ${AppShell.list({ title: '', className: 'fin-rb-list', columns: [
    { key: 'k', label: '', html: (x) => esc(x.k) },
    { key: 't', label: 'Heute', align: 'right', html: (x) => `<span class="fin-num">${x.t}</span>` },
    { key: 'r', label: 'Mieten', align: 'right', html: (x) => `<span class="fin-num">${x.r}</span>` },
    { key: 'b', label: 'Kaufen', align: 'right', html: (x) => `<span class="fin-num">${x.b}</span>` },
  ], rows })}`;
  }

  function render(host, d) {
    const { esc, euro } = Fin; let v = readUrl();
    const free = Math.max(0, (d.liquid || 0) / 100 - v.buffer);
    host.innerHTML = `<section class="fin-rb" aria-labelledby="fin-rb-title"><div class="fin-rb-head"><h2 id="fin-rb-title">Mieten oder Kaufen</h2><button type="button" class="bh-btn" data-rb-reset>Zurücksetzen</button></div>
      <p class="fin-hint">Heute: ${esc(euro(d.estimate ? -d.estimate.perMonth : 0))} Wohnkosten im Monat. Auf den Privatkonten liegen ${esc(euro(d.liquid || 0))}; über dem Puffer frei: <span data-rb-free>${esc(euro(Math.round(free * 100)))}</span>. Die Werte stehen in der Adresse und lassen sich als Link teilen.</p>
      <form class="fin-rb-form" novalidate>${FIELDS.map(([group, fields]) => `<fieldset class="fin-rb-group"><legend>${esc(group)}</legend>${fields.map(([k, label, hint]) => `<label class="bh-label" for="fin-rb-${k}">${esc(label)}</label><input class="bh-input" id="fin-rb-${k}" name="${k}" type="number"${k === 'free' ? '' : ' min="0"'} step="any" inputmode="decimal" value="${v[k]}"${hint ? ` aria-describedby="fin-rb-${k}-hint"` : ''}>${hint ? `<span class="fin-hint" id="fin-rb-${k}-hint">${esc(hint)}</span>` : ''}`).join('')}</fieldset>`).join('')}</form>
      <div class="fin-rb-result" aria-live="polite"></div></section>`;
    const out = host.querySelector('.fin-rb-result'); const form = host.querySelector('form');
    const update = () => {
      const next = { ...v };
      for (const k of Object.keys(DEFAULTS)) { const n = Number(form.elements[k].value); if (form.elements[k].value !== '' && Number.isFinite(n) && (n >= 0 || k === 'free')) next[k] = n; }
      v = next; writeUrl(v);
      host.querySelector('[data-rb-free]').textContent = euro(Math.round(Math.max(0, (d.liquid || 0) / 100 - v.buffer) * 100));
      result(out, v, d);
    };
    form.addEventListener('input', update);
    host.querySelector('[data-rb-reset]').addEventListener('click', () => { v = { ...DEFAULTS }; for (const k of Object.keys(DEFAULTS)) form.elements[k].value = v[k]; update(); });
    result(out, v, d);
  }

  const api = { DEFAULTS, calc, render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FinRentBuy = api;
})();
