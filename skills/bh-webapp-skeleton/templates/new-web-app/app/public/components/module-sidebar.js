'use strict';
/**
 * Linke Modul-Sidebar, gezeichnet vom Rahmen (bh-app-shell.js: einklappbar, ziehbar 180–420 px, Zähler).
 *   ModuleSidebar.show({ title, items: [{ id, label, href, icon, count? }], active, storageKey })
 * Icons: BHAppShell.ICONS oder iconSvg: '<svg…>' je Eintrag.
 */
window.ModuleSidebar = {
  show({ title, items, active, storageKey }) {
    const shell = window.Navbar && Navbar.shell();
    if (shell) shell.setSidebar({ title, items, active, key: storageKey });
  },
};
