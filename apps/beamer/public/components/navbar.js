'use strict';
/**
 * Beamer: Einstellungen des Rahmens. Der Rahmen selbst ist bh-app-shell.js.
 *   Navbar.render(aktiverTab, me)  erster Aufruf baut den Rahmen, spätere aktualisieren Tab und Benutzer
 *   Navbar.shell()                 die BHAppShell-Instanz (setCrumbs, setSidebar, setActiveTab, main)
 * Seitenknöpfe gehören nie in die Navbar, sondern in den Seitenkopf.
 */
(function () {
  // Modul-Tabs: beim Anlegen neuer Seiten ergänzen. `id` ist der Wert für Navbar.render().
  var TABS = [
  ];
  var shell = null;

  function get() {
    if (shell || !window.BHAppShell) return shell;
    shell = window.BHAppShell.mount({
      root: document.getElementById('app-root') || document.body,
      // Navbar = "[BH-Kachel] App-Name"; das Icon erzeugt scripts/make-app-icons.mjs.
      app: { name: 'Beamer', href: '/beamer/',
        logo: '<img class="bhs-brand" src="/beamer/branding/nav-icon.svg?v=1" width="24" height="24" alt="">' },
      tabs: TABS,
      adminHref: '/beamer/admin', // Zahnrad nur für Admins
    });
    return shell;
  }

  function render(activeTab, me) {
    var s = get();
    if (!s) return;
    s.setActiveTab(activeTab);
    if (me) s.setUser({ name: me.name, email: me.email, role: me.role });
  }

  window.Navbar = { render: render, shell: get };
})();
