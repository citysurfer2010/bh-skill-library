'use strict';
/** Pages of Zottel: start, a conversation (/c/<id>) and what Zottel remembers (/memory). */
(async () => {
  const BASE = window.APP_BASE; const esc = AppShell.esc; const host = document.getElementById('page-host');
  const path = location.pathname.slice(BASE.length) || '/';
  const chatId = /^\/c\/([a-f0-9]+)$/.exec(path)?.[1] || null;
  const onMemory = path === '/memory';
  AppShell.crumbs([['Zottel']]);
  AppShell.loading(host, 'Zottel', 'form');

  async function sidebar(active) {
    const { chats } = await ZottelChat.api('GET', '/chats');
    const items = [{ id: 'new', label: '+ Neues Gespräch', href: `${BASE}/` }, ...chats.map((c) => ({ id: c.id, label: c.title, href: `${BASE}/c/${c.id}`, count: c.unread ? 'neu' : '' }))];
    Navbar.shell().setSidebar({ title: 'Gespräche', items, active: active || 'new', key: 'zottel' });
  }

  try {
    const me = await ZottelApi.me();
    Navbar.render(onMemory ? 'memory' : 'home', me);
    document.body.classList.add('zt-body');
    sidebar(onMemory ? 'none' : chatId).catch(() => {});
    if (!onMemory && !chatId) {
      // First visit: Zottel introduces himself and sets himself up.
      const setup = await ZottelChat.api('GET', '/setup');
      if (!setup.done) { const { chatId: id } = await ZottelChat.api('POST', '/setup', {}); location.replace(`${BASE}/c/${id}`); return; }
    }
    if (onMemory) await ZottelMine.start(host);
    else ZottelChat.start(host, { chatId, me, onChange: (id) => sidebar(id).catch(() => {}) });
  } catch (e) {
    host.innerHTML = `<p class="zt-note" role="alert">${esc(e.message)}</p>`;
  }
})();
