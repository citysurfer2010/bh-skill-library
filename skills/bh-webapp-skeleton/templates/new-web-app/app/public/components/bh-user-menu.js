'use strict';
/**
 * BHUserMenu — Benutzermenü oben rechts, bekommt den Benutzer aus /api/me.
 *   BHUserMenu.mount(elementId, { user: { name, email, role }, themeToggle })
 * Standard der BH Platform, gleiche Einträge wie im Anmeldedienst (Skill bh-webapp-skeleton).
 * Profil und Abmelden gehören zum BH-Anmeldedienst unter derselben Adresse, die App hat keine eigene Sitzung.
 */
window.BHUserMenu = (() => {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEVRON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  const initials = (u) => String(u.name || u.email || '?').split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  let closeOpen = null;

  function mount(id, { user, themeToggle = true }) {
    const host = document.getElementById(id);
    if (!host || !user) return;
    if (closeOpen) closeOpen();
    host.innerHTML = `<div class="bh-um"><button type="button" class="bh-um-btn" aria-haspopup="menu" aria-expanded="false">`
      + `<span class="bh-um-avatar" aria-hidden="true">${esc(initials(user))}</span><span class="bh-um-name">${esc(user.name || user.email)}</span><span class="bh-um-chevron">${CHEVRON}</span></button>`
      + `<div class="bh-um-pop" role="menu" hidden><div class="bh-um-head"><div class="bh-um-who">${esc(user.name || user.email)}</div><div class="bh-um-mail">${esc(user.email)}</div>`
      + `<span class="bh-um-role">${user.role === 'admin' ? 'Admin' : 'Benutzer'}</span></div>`
      + '<a class="bh-um-item" role="menuitem" href="/">App-Übersicht</a><a class="bh-um-item" role="menuitem" href="/profile">Mein Profil</a>'
      + (themeToggle ? '<div class="bh-um-theme"><span>Design</span><div class="bh-um-seg"><button type="button" data-um-theme="light">Hell</button><button type="button" data-um-theme="dark">Dunkel</button></div></div>' : '')
      + '<form class="bh-um-logout" method="post" action="/logout"><button class="bh-um-item bh-um-danger" role="menuitem">Abmelden</button></form>'
      + '</div></div>';
    const btn = host.querySelector('.bh-um-btn');
    const pop = host.querySelector('.bh-um-pop');
    const set = (open) => { pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    const onDoc = (e) => { if (!host.contains(e.target)) set(false); };
    const onKey = (e) => { if (e.key === 'Escape' && !pop.hidden) { set(false); btn.focus(); } };
    btn.addEventListener('click', () => set(pop.hidden));
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    closeOpen = () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    const choices = host.querySelectorAll('[data-um-theme]');
    const mark = () => choices.forEach((c) => c.classList.toggle('is-active', c.dataset.umTheme === Theme.get()));
    choices.forEach((c) => c.addEventListener('click', () => { if (Theme.get() !== c.dataset.umTheme) Theme.toggle(); mark(); }));
    mark();
  }

  return { mount };
})();
