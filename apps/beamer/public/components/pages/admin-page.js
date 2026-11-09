'use strict';
/** Admin area: example page, the role check happens on the server (requireRole('admin')). */
(async () => {
  const host = document.getElementById('page-host');
  try {
    Navbar.render('admin', null);
    AppShell.crumbs([['Beamer', '/beamer/'], ['Admin']]);
    AppShell.loading(host, 'Admin', 'form');
    const me = await BeamerApi.me();
    Navbar.render('admin', me);
    AppShell.render(host, `<header class="app-topbar"><div><h1>Admin</h1><div class="sub">Nur für Admins sichtbar. Beispielseite, ersetzen.</div></div><div class="app-topbar-actions" data-page-actions></div></header>
      <section class="card"><p class="muted reset-m0">Angemeldet als ${AppShell.esc(me.email)}.</p></section>`);
  } catch (e) {
    Toast.error(e.message || 'Fehler beim Laden');
  }
})();
