'use strict';
/**
 * Left module sidebar, drawn by the frame (bh-app-shell.js: collapsible, draggable 180–420 px, counters).
 *   ModuleSidebar.show({ title, items: [{ id, label, href, icon, count? }], active, storageKey })
 * Icons: BHAppShell.ICONS or iconSvg: '<svg…>' per entry.
 */
window.ModuleSidebar = {
  show({ title, items, active, storageKey }) {
    const shell = window.Navbar && Navbar.shell();
    if (shell) shell.setSidebar({ title, items, active, key: storageKey });
  },
};
