'use strict';
/**
 * Terminal: frame settings. The frame itself is bh-app-shell.js.
 *   Navbar.render(activeTab, me)  first call builds the frame, later ones update tab and user
 *   Navbar.shell()                 the BHAppShell instance (setCrumbs, setSidebar, setActiveTab, main)
 * Page buttons never belong in the navbar, but in the page header.
 */
(function () {
  // Module tabs: extend when adding new pages. `id` is the value for Navbar.render().
  var TABS = [
  ];
  var shell = null;

  function get() {
    if (shell || !window.BHAppShell) return shell;
    shell = window.BHAppShell.mount({
      root: document.getElementById('app-root') || document.body,
      // Navbar = "[BH tile] app name"; scripts/make-app-icons.mjs generates the icon.
      app: { name: 'Terminal', href: '/terminal/',
        logo: '<img class="bhs-brand" src="/terminal/branding/nav-icon.svg?v=2" width="24" height="24" alt="">' },
      tabs: TABS,
      adminHref: '/terminal/admin', // Gear for admins only
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
