'use strict';
/**
 * Finance pages: / overview · /transactions(/id) · /investments · /import · /categories.
 * Loading standard: frame at once, placeholders until the data arrives, in-module links without reload.
 */
(async () => {
  const BASE = '/finance'; const host = document.getElementById('page-host');
  const path = () => location.pathname.slice(BASE.length) || '/';
  const PAGES = [
    { id: 'overview', label: 'Übersicht', href: `${BASE}/`, icon: 'chart', match: /^\/$/ },
    { id: 'transactions', label: 'Buchungen', href: `${BASE}/transactions`, icon: 'list', match: /^\/transactions(?:\/(\d+))?\/?$/ },
    { id: 'investments', label: 'Investments und Rücklagen', href: `${BASE}/investments`, icon: 'euro', match: /^\/investments\/?$/ },
    { id: 'import', label: 'Importieren', href: `${BASE}/import`, icon: 'upload', match: /^\/import\/?$/ },
    { id: 'categories', label: 'Kategorien', href: `${BASE}/categories`, icon: 'settings', match: /^\/categories\/?$/ },
  ];
  let me = null;

  async function route() {
    const p = PAGES.find((x) => x.match.test(path())) || PAGES[0];
    const id = p.match.exec(path())?.[1];
    ModuleSidebar.show({ title: 'Finanzen', active: p.id, storageKey: 'finance-sidebar-collapsed', items: PAGES.map(({ id: i, label, href, icon }) => ({ id: i, label, href, icon })) });
    AppShell.crumbs([['Finanzen', `${BASE}/`], [p.label]]);
    if (p.id === 'transactions' && FinTransactions.isOpen(host)) return FinTransactions.show(id);
    if (BHSideDrawer.isOpen()) BHSideDrawer.close({ silent: true });
    AppShell.loading(host, p.label, p.id === 'transactions' ? 'table' : 'cards');
    me = me || await FinanceApi.me();
    if (!me.finance) { AppShell.render(host, '<header class="app-topbar"><div><h1>Kein Zugang</h1><div class="sub">Die Finanzen sind privat. Ein Admin kann dich unter „Importieren“ freigeben.</div></div></header>'); return undefined; }
    const year = Fin.yearOf();
    if (p.id === 'overview') return FinOverview.render(host, year);
    if (p.id === 'transactions') return FinTransactions.render(host, year, id);
    if (p.id === 'investments') return FinInvestments.render(host, year);
    if (p.id === 'import') return FinImport.render(host);
    return FinCategories.render(host);
  }

  const fail = (e) => Toast.error(e.message || 'Fehler beim Laden');
  const go = (href) => { history.pushState(null, '', href); route().catch(fail); };
  AppShell.links(`${BASE}/`, go);
  window.addEventListener('popstate', () => route().catch(fail));
  try {
    Navbar.render('home', null);
    const pending = route();
    Navbar.render('home', await FinanceApi.me());
    await pending;
  } catch (e) { fail(e); }
})();
