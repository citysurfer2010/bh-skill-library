'use strict';
/** Transactions: list with work lists, detail panel to assign a category. Every assignment teaches the rules. */
window.FinTransactions = (() => {
  const { esc, euro, date, BASE } = Fin;
  let page = null; let rows = []; let cats = []; let year = null; let filter = 'all'; let category = null; let account = null; let allYears = false;

  const kpis = () => [
    { key: 'all', label: 'Alle', value: rows.length },
    { key: 'open', label: 'Zu prüfen', value: rows.filter((r) => !r.category).length },
    { key: 'in', label: 'Eingänge', value: rows.filter((r) => r.amount_cents > 0).length },
    { key: 'out', label: 'Ausgänge', value: rows.filter((r) => r.amount_cents < 0).length },
  ];
  const visible = () => rows.filter((r) => (filter === 'open' ? !r.category : filter === 'in' ? r.amount_cents > 0 : filter === 'out' ? r.amount_cents < 0 : true));

  function catCell(r) {
    if (r.category) return `${esc(r.category_name || r.category)}${r.category_source === 'rule' ? ' <span class="fin-tag" title="Automatisch aus gelernten Regeln">auto</span>' : ''}`;
    const name = r.suggestion && cats.find((c) => c.code === r.suggestion)?.name;
    return r.suggestion ? `<span class="fin-open">Vorschlag: ${esc(name || r.suggestion)}</span>` : '<span class="fin-open">Zu prüfen</span>';
  }

  /** Items of the Amazon order, loaded when the detail opens; each links to its product page. */
  async function amazonItems(r, panel) {
    try {
      const { transaction } = await Fin.api('GET', `/transactions/${r.id}`);
      const box = panel?.querySelector('[data-amazon]'); if (!box || !transaction.amazon_items?.length) return;
      box.querySelector('.fin-amazon-head').insertAdjacentHTML('afterend', `<ul class="fin-amazon-items">${transaction.amazon_items.map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(i.title)} (öffnet Amazon)">${esc(i.title)}</a></li>`).join('')}</ul>`);
    } catch { /* the order link is still there */ }
  }

  function detail(r) {
    const i = visible().indexOf(r); const list = visible();
    const body = `<dl class="app-dl"><dt>Datum</dt><dd>${esc(date(r.booked_on))}</dd><dt>Betrag</dt><dd>${Fin.amount(r.amount_cents)}</dd><dt>Konto</dt><dd>${esc(r.account)}</dd><dt>Vorgang</dt><dd>${esc(r.kind)}</dd><dt>Gegenpartei</dt><dd>${esc(r.counterparty)}</dd><dt>Text</dt><dd class="fin-wrap">${esc(r.text)}</dd></dl>${r.amazon_order || Fin.amazonOrder(r.text) ? `<div class="fin-amazon-box" data-amazon><h3 class="fin-amazon-head">Amazon-Bestellung</h3><p class="fin-amazon-row">${Fin.amazonLink(r.amazon_order || r.text)}</p></div>` : ''}
      <div class="fin-form"><label class="bh-label" for="fin-cat">Kategorie</label><div id="fin-cat"></div>
      ${r.suggestion && !r.category ? `<p class="fin-hint">Vorschlag, weil diese Gegenpartei schon so zugeordnet wurde:</p><button type="button" class="bh-btn bh-btn-sm" data-take="${esc(r.suggestion)}">${esc(cats.find((c) => c.code === r.suggestion)?.name || r.suggestion)} übernehmen</button>` : ''}
      <label class="bh-label" for="fin-note">Bemerkung</label><input id="fin-note" class="bh-input" maxlength="300" value="${esc(r.note)}">
      <p class="fin-hint">Was du zuordnest, merkt sich die App für diese Gegenpartei. Ab dem zweiten gleichen Mal ordnet sie neue Buchungen selbst zu.</p>
      <div class="fin-next"><span class="fin-hint" role="status" data-left>${leftText()}</span>${rows.some((x) => !x.category && x !== r) ? '<button type="button" class="bh-btn bh-btn-sm" data-next-open>Nächste offene</button>' : ''}</div></div>`;
    const o = { title: `${esc(r.counterparty || 'Buchung')} · ${esc(euro(r.amount_cents))}`, body, storageKey: 'finance-detail', position: `${i + 1} von ${list.length}`,
      prev: i > 0 ? () => open(list[i - 1]) : null, next: i < list.length - 1 ? () => open(list[i + 1]) : null, onClose: () => history.replaceState(null, '', `${listHref()}${location.search}`) };
    if (BHSideDrawer.isOpen()) BHSideDrawer.update(o); else BHSideDrawer.open(o);
    const panel = document.querySelector('.bh-sd-panel');
    if (r.amazon_order) amazonItems(r, panel);
    const save = async (patch) => {
      try {
        const { transaction, applied } = await Fin.api('PATCH', `/transactions/${r.id}`, patch);
        Object.assign(r, transaction, { category_name: cats.find((c) => c.code === transaction.category)?.name });
        Toast.success(applied ? `Gespeichert, ${applied} weitere Buchungen automatisch zugeordnet` : 'Gespeichert');
        const left = panel.querySelector('[data-left]'); if (left) left.textContent = leftText(applied);
        if (applied) await load(); else { page.table.setRows(visible()); page.setKpis(kpis(), filter); }
      } catch (e) { Toast.error(e.message); }
    };
    BHSelectCore.create(panel.querySelector('#fin-cat'), { options: Fin.categoryOptions(cats), value: r.category || '', label: 'Kategorie', searchable: true, onChange: (v) => save({ category: v || null }) });
    panel.querySelector('[data-take]')?.addEventListener('click', (e) => save({ category: e.target.dataset.take }));
    panel.querySelector('#fin-note').addEventListener('change', (e) => save({ note: e.target.value }));
    panel.querySelector('[data-next-open]')?.addEventListener('click', () => { const n = nextOpen(r); if (n) open(n); });
  }
  const leftText = (applied = 0) => { const n = rows.filter((x) => !x.category).length; return `${n === 0 ? 'Alles zugeordnet' : `Noch ${n} offen`}${applied ? `, ${applied} gerade automatisch zugeordnet` : ''}`; };
  function nextOpen(r) { const list = rows.filter((x) => !x.category && x !== r); return list.find((x) => x.booked_on <= r.booked_on) || list[0] || null; }
  function open(r) { history.pushState(null, '', `${BASE}/transactions/${r.id}${location.search}`); detail(r); }

  async function load() {
    page.table.setLoading(true);
    const q = new URLSearchParams({ year: allYears ? 'all' : year || '' }); if (category) q.set('category', category); if (account) q.set('account', account);
    const data = await Fin.api('GET', `/transactions?${q}`);
    rows = data.transactions.map((r) => ({ ...r })); page.setKpis(kpis(), filter); page.table.setRows(visible());
    return data;
  }

  /** Called on every route change inside the list: keeps the list, only opens or closes the panel. */
  function show(id) {
    const r = id && rows.find((x) => String(x.id) === String(id));
    if (r) detail(r); else if (BHSideDrawer.isOpen()) BHSideDrawer.close({ silent: true });
  }
  const isOpen = (host) => !!page && host.contains(page.root);

  /** The list this transaction belongs to; the detail itself has a year-free address (/finance/transactions/<id>). */
  const listHref = () => Fin.yearHref(allYears ? 'all' : year || new Date().getFullYear(), 'transactions');

  async function render(host, y, id, jumped = false) {
    year = y; category = new URLSearchParams(location.search).get('category'); account = new URLSearchParams(location.search).get('account'); allYears = !jumped && Fin.allYears();
    if (category === 'OFFEN') { filter = 'open'; category = null; }
    cats = (await Fin.api('GET', '/categories')).categories;
    const catName = category ? cats.find((c) => c.code === category)?.name || category : null;
    page = BHListPage.render(host, {
      title: account ? `Buchungen: ${account}` : catName ? `Buchungen: ${catName}` : 'Buchungen', sub: `${allYears ? 'Alle Jahre' : `Jahr ${year || new Date().getFullYear()}`} · ${account ? 'ein Konto' : 'Haushaltskonten'}`, search: { placeholder: 'Gegenpartei, Text, Betrag …' },
      kpis: kpis(), kpiActive: filter, onKpi: (k) => { filter = k; page.setKpis(kpis(), k); page.table.setRows(visible()); },
      topActions: [{ label: 'Kontoauszug importieren', primary: true, icon: 'upload', href: `${BASE}/import` }].concat(category ? [{ label: 'Alle Kategorien', href: listHref() }] : []).concat(account ? [{ label: 'Alle Konten', href: `${BASE}/accounts` }] : []),
      countLabel: ['Buchung', 'Buchungen'],
      table: { storageKey: 'finance-transactions', rowHref: (r) => `${BASE}/transactions/${r.id}${location.search}`, itemLabel: ['Buchung', 'Buchungen'], emptyMessage: 'Keine Buchungen in dieser Auswahl.',
        columns: [
          { key: 'booked_on', label: 'Datum', width: 124, render: (r) => esc(date(r.booked_on)), sortValue: (r) => r.booked_on },
          { key: 'counterparty', label: 'Gegenpartei', width: 220 },
          { key: 'amount_cents', label: 'Betrag', width: 130, align: 'right', render: (r) => Fin.amount(r.amount_cents), sortValue: (r) => r.amount_cents },
          { key: 'category', label: 'Kategorie', width: 200, render: catCell, sortValue: (r) => r.category || '' },
          { key: 'account', label: 'Konto', width: 110 }, { key: 'text', label: 'Text', width: 320, render: (r) => (r.amazon_titles ? `<span class="fin-amazon-titles">Amazon: ${esc(r.amazon_titles)}</span>` : esc(r.text)), sortValue: (r) => r.amazon_titles || r.text },
        ].filter((c) => !(account && c.key === 'account')) },
    });
    const data = await load();
    if (!year && data.years.length) year = data.years[0];
    // A link to a transaction of another year opens that year, so every transaction address works on its own.
    if (id && !allYears && !rows.some((x) => String(x.id) === String(id))) {
      try {
        const { transaction } = await Fin.api('GET', `/transactions/${encodeURIComponent(id)}`);
        const y2 = Number(transaction.booked_on.slice(0, 4));
        if (!jumped && y2 !== year) return render(host, y2, id, true);
      } catch (x) { Toast.error(x.message); history.replaceState(null, '', `${listHref()}${location.search}`); }
    }
    show(id);
  }

  return { render, show, isOpen };
})();
