'use strict';
/**
 * Finance pages: / overview · /transactions(/id) · /investments · /loans · /housing · /wealth · /amazon · /accounts · /import · /categories.
 * Module Immobilien (own navbar tab and sidebar): /estate.
 * Loading standard: frame at once, placeholders until the data arrives, in-module links without reload.
 */
(async () => {
  const BASE = '/finance'; const host = document.getElementById('page-host');
  const path = () => location.pathname.slice(BASE.length) || '/';
  const PAGES = [
    { id: 'overview', label: 'Übersicht', href: `${BASE}/`, icon: 'chart', match: /^\/(?:\d{4}\/?)?$/ },
    { id: 'transactions', label: 'Buchungen', href: `${BASE}/transactions`, icon: 'list', match: /^\/(?:(?:\d{4}|all)\/)?transactions(?:\/(\d+))?\/?$/ },
    { id: 'wealth', label: 'Vermögen', href: `${BASE}/wealth`, icon: 'wallet', match: /^\/wealth\/?$/ },
    { id: 'investments', label: 'Investments und Rücklagen', href: `${BASE}/investments`, icon: 'euro', match: /^\/(?:\d{4}\/)?investments\/?$/ },
    { id: 'loans', label: 'Kredite', href: `${BASE}/loans`, icon: 'page', match: /^\/loans\/?$/ },
    { id: 'housing', label: 'Wohnkosten', href: `${BASE}/housing`, icon: 'pin', match: /^\/housing\/?$/ },
    { id: 'amazon', label: 'Amazon', href: `${BASE}/amazon`, icon: 'inbox', match: /^\/amazon\/?$/ },
    { id: 'accounts', label: 'Konten', href: `${BASE}/accounts`, icon: 'building', match: /^\/accounts\/?$/ },
    { id: 'import', label: 'Importieren', href: `${BASE}/import`, icon: 'upload', match: /^\/import\/?$/ },
    { id: 'categories', label: 'Kategorien', href: `${BASE}/categories`, icon: 'settings', match: /^\/categories\/?$/ },
  ];
  // Module Immobilien: its own tab and sidebar; loans stay in Finanzen (15.11.2026).
  const ESTATE = [{ id: 'estate', label: 'Wohnungen', href: `${BASE}/estate`, icon: 'home', match: /^\/estate\/?$/ }];
  // Module Einkommensteuer (24.11.2026): overview and one entry per tax year in its sidebar.
  const TAX = { id: 'tax', label: 'Übersicht', href: `${BASE}/tax`, icon: 'chart', match: /^\/tax(?:\/(\d{4}))?\/?$/ };
  let me = null;

  /** Old links with ?year=2026 become /finance/2026/… (other query parameters stay). */
  function yearQueryToPath() {
    const q = new URLSearchParams(location.search); const y = q.get('year');
    if (!y || !/^(\d{4}|all)$/.test(y)) return;
    const rest = location.pathname.slice(BASE.length).replace(/^\/(?:\d{4}|all)(?=\/|$)/, '');
    if (!/^\/?(transactions|investments)?\/?$/.test(rest)) return;
    q.delete('year'); const page = rest.replace(/\//g, '');
    history.replaceState(null, '', `${Fin.yearHref(y, page)}${q.toString() ? `?${q}` : ''}`);
  }

  async function taxRoute() {
    const y = TAX.match.exec(path())[1];
    Navbar.render('tax', me);
    const d = await Fin.api('GET', '/tax').catch(() => ({ items: [] }));
    const items = [{ id: 'tax', label: 'Übersicht', href: TAX.href, icon: 'chart' }, ...d.items.map((r) => ({ id: `tax-${r.year}`, label: String(r.year), href: `${BASE}/tax/${r.year}`, icon: 'check', count: r.open_todos || undefined }))];
    ModuleSidebar.show({ title: 'Einkommensteuer', active: y ? `tax-${y}` : 'tax', storageKey: 'finance-sidebar-collapsed', items });
    AppShell.crumbs(y ? [['Einkommensteuer', TAX.href], [y]] : [['Einkommensteuer', TAX.href]]);
    AppShell.loading(host, y ? `Einkommensteuer ${y}` : 'Einkommensteuer', 'cards');
    me = me || await FinanceApi.me();
    if (!me.finance) { AppShell.render(host, '<header class="app-topbar"><div><h1>Kein Zugang</h1></div></header>'); return undefined; }
    return y ? FinTax.year(host, Number(y)) : FinTax.overview(host, d);
  }

  async function route() {
    yearQueryToPath();
    if (TAX.match.test(path())) return taxRoute();
    const estate = ESTATE.find((x) => x.match.test(path()));
    const p = estate || PAGES.find((x) => x.match.test(path())) || PAGES[0];
    const id = p.match.exec(path())?.[1];
    const [mod, items, home] = estate ? ['Immobilien', ESTATE, `${BASE}/estate`] : ['Finanzen', PAGES, `${BASE}/`];
    Navbar.render(estate ? 'estate' : 'home', me);
    ModuleSidebar.show({ title: mod, active: p.id, storageKey: 'finance-sidebar-collapsed', items: items.map(({ id: i, label, href, icon }) => ({ id: i, label, href, icon })) });
    AppShell.crumbs([[mod, home], [p.label]]);
    if (p.id === 'transactions' && FinTransactions.isOpen(host)) return FinTransactions.show(id);
    if (BHSideDrawer.isOpen()) BHSideDrawer.close({ silent: true });
    AppShell.loading(host, p.label, p.id === 'transactions' ? 'table' : 'cards');
    me = me || await FinanceApi.me();
    if (!me.finance) { AppShell.render(host, '<header class="app-topbar"><div><h1>Kein Zugang</h1><div class="sub">Die Finanzen sind privat. Ein Admin kann dich unter „Importieren“ freigeben.</div></div></header>'); return undefined; }
    const year = Fin.yearOf();
    if (p.id === 'overview') return FinOverview.render(host, year);
    if (p.id === 'transactions') return FinTransactions.render(host, year, id);
    if (p.id === 'investments') return FinInvestments.render(host, year);
    if (p.id === 'estate') return FinEstate.render(host);
    if (p.id === 'loans') return FinLoans.render(host);
    if (p.id === 'amazon') return FinPurchases.render(host);
    if (p.id === 'housing') return FinHousing.render(host);
    if (p.id === 'wealth') return FinWealth.render(host);
    if (p.id === 'accounts') return FinAccounts.render(host);
    if (p.id === 'import') return FinImport.render(host);
    return FinCategories.render(host);
  }

  const fail = (e) => Toast.error(e.message || 'Fehler beim Laden');
  const go = (href) => { history.pushState(null, '', href); route().catch(fail); };
  AppShell.links(`${BASE}/`, go);
  window.addEventListener('popstate', () => route().catch(fail));
  try {
    Navbar.render(/^\/estate/.test(path()) ? 'estate' : /^\/tax/.test(path()) ? 'tax' : 'home', null);
    const pending = route();
    Navbar.render(/^\/estate/.test(path()) ? 'estate' : /^\/tax/.test(path()) ? 'tax' : 'home', await FinanceApi.me());
    await pending;
  } catch (e) { fail(e); }
})();
