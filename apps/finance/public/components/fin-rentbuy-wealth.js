'use strict';
/** Mieten oder Kaufen, zweiter Teil: Vermögen über die Jahre (math in wealth(), also used by the unit test). */
(function () {
  /**
   * Vermögen über die Jahre (22.11.2026: "lohnt sich kaufen oder mieten in bezug auf den weiteren Vermögensaufbau?").
   * Same equity both ways: buying puts it into the flat, renting invests it. Each month whoever lives cheaper invests
   * the difference. Rent and running costs rise yearly, the flat's value rises yearly, after 10 years the loan
   * continues at the follow-up rate. Buy = value − rest of loan + invested savings; rent = invested equity + savings.
   */
  const WDEFAULTS = { years: 25, growth: 2, etf: 5, rentup: 2, refi: 4.5 };
  function wealth(input, wInput) {
    const v = { ...input }; const w = { ...WDEFAULTS, ...wInput };
    const closing = (v.price * v.closing) / 100; const loan0 = Math.max(0, v.price + closing - v.equity);
    const annuity = (loan0 * (v.rate + v.repay)) / 100 / 12; const re = (1 + w.etf / 100) ** (1 / 12) - 1;
    let loan = loan0; let value = v.price; let running = v.hoa + v.buyPower + v.repairs; let rentM = v.rent + v.rentPower;
    let depotRent = Math.min(v.equity, v.price + closing); let depotBuy = 0;
    const points = [{ year: 0, buy: value - loan, rent: depotRent }];
    for (let m = 1; m <= w.years * 12; m++) {
      const rate = (m <= 120 ? v.rate : w.refi) / 100 / 12; const interest = loan * rate;
      const pay = loan > 0 ? Math.min(annuity, loan + interest) : 0; loan = Math.max(0, loan + interest - pay);
      const diff = pay + running - rentM;
      depotRent = depotRent * (1 + re) + Math.max(0, diff); depotBuy = depotBuy * (1 + re) + Math.max(0, -diff);
      value *= (1 + w.growth / 100) ** (1 / 12);
      if (m % 12 === 0) { running *= 1 + w.rentup / 100; rentM *= 1 + w.rentup / 100; points.push({ year: m / 12, buy: value - loan + depotBuy, rent: depotRent, loan, value }); }
    }
    const end = points.at(-1); const ahead = points.find((p) => p.year > 0 && p.buy >= p.rent);
    const stays = ahead && points.filter((p) => p.year >= ahead.year).every((p) => p.buy >= p.rent);
    return { points, end, diff: end.buy - end.rent, breakEven: stays ? ahead.year : null };
  }

  const SLIDERS = [
    ['years', 'Zeitraum', 5, 35, 1, (x) => `${x} Jahre`],
    ['growth', 'Wertsteigerung der Wohnung', 0, 5, 0.5, (x) => `${fmtPct(x)} im Jahr`],
    ['etf', 'Rendite der Geldanlage nach Steuern', 0, 9, 0.5, (x) => `${fmtPct(x)} im Jahr`],
  ];
  const MORE = [
    ['rentup', 'Miete und Nebenkosten steigen um', 0, 5, 0.5, (x) => `${fmtPct(x)} im Jahr`],
    ['refi', 'Zins nach 10 Jahren', 1, 9, 0.25, (x) => `${fmtPct(x)}`],
  ];
  function fmtPct(x) { return `${x.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`; }
  const eur0 = (x) => `${Math.round(x).toLocaleString('de-DE')} €`;
  const tsd = (c) => `${Math.round(c / 1000).toLocaleString('de-DE')} Tsd. €`;

  function slider([k, label, min, max, step, show], w) {
    return `<div class="fin-rbw-slider"><div class="fin-rbw-slider-head"><label for="fin-rbw-${k}">${Fin.esc(label)}</label><output for="fin-rbw-${k}" data-out="${k}">${Fin.esc(show(w[k]))}</output></div>
      <input type="range" id="fin-rbw-${k}" name="${k}" min="${min}" max="${max}" step="${step}" value="${w[k]}"></div>`;
  }

  function chart(points, width) {
    const W = Math.max(300, Math.min(900, width || 640)); const H = W < 480 ? 220 : 260; const L = 64; const R = W < 480 ? 12 : 84; const T = 28; const B = 28;
    const vals = points.flatMap((p) => [p.buy, p.rent]); const lo0 = Math.min(0, ...vals); const hi0 = Math.max(...vals);
    const raw = (hi0 - lo0) / 4; const p10 = 10 ** Math.floor(Math.log10(raw || 1)); const step = [1, 2, 2.5, 5, 10].map((f) => f * p10).find((s) => s >= raw) || raw;
    const lo = Math.floor(lo0 / step) * step; const hi = Math.ceil(hi0 / step) * step || step;
    const n = points.length - 1; const x = (i) => L + ((W - L - R) * i) / (n || 1); const y = (val) => T + (H - T - B) * (1 - (val - lo) / (hi - lo));
    const grid = []; for (let g = lo; g <= hi + 1e-6; g += step) grid.push(`<line class="fin-grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text class="fin-axis" x="${L - 8}" y="${y(g) + 4}" text-anchor="end">${Math.round(g / 1000).toLocaleString('de-DE')}</text>`);
    const every = n > 20 ? 5 : n > 10 ? 2 : 1;
    const xs = points.filter((p) => p.year % every === 0).map((p) => `<text class="fin-axis" x="${x(p.year)}" y="${H - 8}" text-anchor="middle">${p.year}</text>`);
    const path = (key) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
    const end = points.at(-1); const ends = W >= 480 ? [['buy', 'Kaufen'], ['rent', 'Mieten']].map(([k, l]) => ({ k, l, y: y(end[k]) })).sort((a, b) => a.y - b.y) : [];
    if (ends.length === 2 && ends[1].y - ends[0].y < 16) { const mid = (ends[0].y + ends[1].y) / 2; ends[0].y = mid - 8; ends[1].y = mid + 8; }
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vermögen Kaufen und Mieten über ${n} Jahre" tabindex="0" data-l="${L}" data-r="${R}" data-w="${W}">
      <text class="fin-axis" x="${L - 8}" y="12" text-anchor="end">Tsd. €</text>${grid.join('')}${xs.join('')}
      <path class="fin-rbw-line fin-rbw-rent" d="${path('rent')}"/><path class="fin-rbw-line fin-rbw-buy" d="${path('buy')}"/>
      ${ends.map((e) => `<text class="fin-endlabel" x="${W - R + 8}" y="${e.y + 4}">${e.l}</text>`).join('')}
      <line class="fin-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="fin-rbw-dot fin-rbw-buy-dot" r="4" visibility="hidden"/><circle class="fin-rbw-dot fin-rbw-rent-dot" r="4" visibility="hidden"/>
    </svg>`;
  }

  function bindTip(box, points) {
    const svg = box.querySelector('svg'); const tip = box.querySelector('.fin-tip'); const { esc } = Fin; const euro = eur0;
    const L = +svg.dataset.l; const R = +svg.dataset.r; const W = +svg.dataset.w; const n = points.length - 1; let at = n;
    const cross = svg.querySelector('.fin-cross'); const dots = { buy: svg.querySelector('.fin-rbw-buy-dot'), rent: svg.querySelector('.fin-rbw-rent-dot') };
    const lineY = (k, i) => { const d = svg.querySelector(`.fin-rbw-${k}`).getAttribute('d').split(/[ML]/).filter(Boolean)[i].split(','); return [+d[0], +d[1]]; };
    const show = (i) => {
      at = Math.max(0, Math.min(n, i)); const p = points[at]; const [cx] = lineY('buy', at);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      for (const k of ['buy', 'rent']) { const [px, py] = lineY(k, at); dots[k].setAttribute('cx', px); dots[k].setAttribute('cy', py); dots[k].setAttribute('visibility', 'visible'); }
      const d = p.buy - p.rent;
      tip.innerHTML = `<strong>Jahr ${p.year}</strong><dl><dt><span class="fin-rbw-key fin-rbw-key-buy"></span>Kaufen</dt><dd>${esc(euro(p.buy))}</dd><dt><span class="fin-rbw-key fin-rbw-key-rent"></span>Mieten</dt><dd>${esc(euro(p.rent))}</dd><dt>${d >= 0 ? 'Kaufen vorne' : 'Mieten vorne'}</dt><dd>${esc(euro(Math.abs(d)))}</dd></dl>`;
      tip.hidden = false; const scale = svg.getBoundingClientRect().width / W || 1;
      box.style.setProperty('--tip-x', `${Math.max(100, Math.min(box.clientWidth - 100, cx * scale))}px`);
    };
    const hide = () => { tip.hidden = true; for (const el of [cross, dots.buy, dots.rent]) el.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(); const sx = ((e.clientX - r.left) / r.width) * W; show(Math.round(((sx - L) / (W - L - R)) * n)); });
    svg.addEventListener('pointerleave', hide); svg.addEventListener('blur', hide);
    svg.addEventListener('focus', () => show(at));
    svg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(at + (e.key === 'ArrowRight' ? 1 : -1)); } });
  }

  function wealthView(host, v, w) {
    const { esc } = Fin; const r = wealth(v, w); const e = (x) => esc(eur0(x));
    const lead = r.diff >= 0 ? 'Kaufen' : 'Mieten';
    const when = r.diff >= 0 && r.breakEven ? ` Kaufen liegt ab Jahr ${r.breakEven} vorne.` : '';
    host.querySelector('[data-rbw-verdict]').innerHTML = `<strong>Nach ${w.years} Jahren: ${lead} bringt ${e(Math.abs(r.diff))} mehr Vermögen.</strong>${esc(when)}`;
    host.querySelector('[data-rbw-buy]').textContent = tsd(r.end.buy);
    host.querySelector('[data-rbw-rent]').textContent = tsd(r.end.rent);
    host.querySelector('[data-rbw-buy-hint]').textContent = `Wohnung ${tsd(r.end.value)} minus Restschuld ${tsd(r.end.loan)}, plus Erspartes`;
    const box = host.querySelector('.fin-rbw-chart'); box.innerHTML = `${chart(r.points, box.clientWidth)}<div class="fin-tip" hidden></div>`; bindTip(box, r.points);
    host.querySelector('[data-rbw-table]').innerHTML = AppShell.list({ title: '', className: 'fin-rbw-list', columns: [
      { key: 'year', label: 'Jahr', html: (p) => esc(String(p.year)) },
      { key: 'buy', label: 'Kaufen', align: 'right', html: (p) => `<span class="fin-num">${e(p.buy)}</span>` },
      { key: 'rent', label: 'Mieten', align: 'right', html: (p) => `<span class="fin-num">${e(p.rent)}</span>` },
    ], rows: r.points.filter((p) => p.year % 5 === 0 || p.year === w.years) });
  }

  function wealthSection(w) {
    return `<section class="fin-rbw" aria-labelledby="fin-rbw-title">
      <h2 id="fin-rbw-title">Was bringt mehr Vermögen?</h2>
      <p class="fin-rbw-verdict" data-rbw-verdict aria-live="polite"></p>
      <div class="fin-rbw-tiles">
        <div class="fin-rbw-tile"><span class="fin-rbw-tile-label"><span class="fin-rbw-key fin-rbw-key-buy"></span>Kaufen</span><strong data-rbw-buy></strong><span class="fin-hint" data-rbw-buy-hint></span></div>
        <div class="fin-rbw-tile"><span class="fin-rbw-tile-label"><span class="fin-rbw-key fin-rbw-key-rent"></span>Mieten</span><strong data-rbw-rent></strong><span class="fin-hint">Eigenkapital angelegt, plus Erspartes</span></div>
      </div>
      <form class="fin-rbw-form" novalidate>${SLIDERS.map((s) => slider(s, w)).join('')}
        <details class="fin-rbw-more"><summary>Weitere Annahmen</summary>${MORE.map((s) => slider(s, w)).join('')}</details></form>
      <p class="fin-rbw-legend" aria-hidden="true"><span><span class="fin-rbw-key fin-rbw-key-buy"></span>Kaufen</span><span><span class="fin-rbw-key fin-rbw-key-rent"></span>Mieten</span><span class="fin-hint">Vermögen am Jahresende</span></p>
      <div class="fin-rbw-chart fin-chart-box"></div>
      <details class="fin-rbw-more"><summary>Als Tabelle</summary><div data-rbw-table></div></details>
      <p class="fin-hint">So wird gerechnet: Das Eigenkapital aus dem Formular oben steckt beim Kaufen in der Wohnung, beim Mieten wird es angelegt. Wer im Monat günstiger wohnt, legt die Differenz an. Kaufnebenkosten sind sofort weg; die Wertsteigerung der selbst genutzten Wohnung ist steuerfrei, deshalb bei der Geldanlage die Rendite nach Steuern eintragen.</p>
    </section>`;
  }

  const api = { WDEFAULTS, wealth, SLIDERS: [...SLIDERS, ...MORE], section: wealthSection, view: wealthView };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FinRentBuyWealth = api;
})();
