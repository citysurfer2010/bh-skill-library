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
    const items = [{ id: 'new', label: '+ Neues Gespräch', href: `${BASE}/` }, ...chats.map((c) => ({ id: c.id, label: c.title, href: `${BASE}/c/${c.id}` }))];
    Navbar.shell().setSidebar({ title: 'Gespräche', items, active: active || 'new', key: 'zottel' });
  }

  function memory() {
    const draw = async () => {
      const { memories } = await ZottelChat.api('GET', '/memories');
      host.innerHTML = `<div class="zt-memory"><div class="zt-big" data-big-figure>${ZottelFigure.html('look')}</div><h1>Was Zottel über dich weiß</h1><p class="zt-muted">Zottel merkt sich nur, was dir dauerhaft hilft. Du kannst jeden Eintrag löschen.</p>${memories.length ? `<ul class="zt-facts">${memories.map((m) => `<li><span>${esc(m.text)}</span><button type="button" class="bh-btn" data-forget="${m.id}">Vergessen</button></li>`).join('')}</ul>` : '<p class="zt-muted">Noch nichts. Sag einfach: „Merk dir, dass …“</p>'}</div>`;
    };
    host.addEventListener('click', async (e) => { const b = e.target.closest('[data-forget]'); if (!b) return; await ZottelChat.api('DELETE', `/memories/${b.dataset.forget}`); draw(); });
    return draw();
  }

  try {
    const me = await ZottelApi.me();
    Navbar.render(onMemory ? 'memory' : 'home', me);
    document.body.classList.add('zt-body');
    sidebar(chatId).catch(() => {});
    if (onMemory) await memory();
    else ZottelChat.start(host, { chatId, me, onChange: (id) => sidebar(id).catch(() => {}) });
  } catch (e) {
    host.innerHTML = `<p class="zt-note" role="alert">${esc(e.message)}</p>`;
  }
})();
