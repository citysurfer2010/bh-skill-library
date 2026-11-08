/**
 * BHAppShell — der eine Rahmen jeder BH-App: Navbar, Breadcrumb, linke Sidebar, Hauptbereich. Vanilla, ohne Build.
 * Stile: public/css/bh-shell.css. Bis 900 px wandern Sidebar und Tabs in ein Menü hinter dem Menüknopf.
 *
 *   const shell = BHAppShell.mount({ root?, app: { name, href, logo? }, tabs?: [{ id, label, href, disabled? }], activeTab?,
 *     themeToggle?: false, adminHref?, user?, sidebar?: { title, items: [{ id, label, href, icon?, count? }], active, key },
 *     crumbs?: [['App', '/'], ['Seite']], onNavigate?(href, event) });
 *   shell.main · shell.setCrumbs(list) · shell.setSidebar({ items?, active?, title? }) · shell.setActiveTab(id) · shell.setUser(me)
 * Braucht bh-user-menu.js und bh-sidebar-resize.js. Icons: BHAppShell.ICONS.
 */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (d, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    home: svg('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    users: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    building: svg('<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    inbox: svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
    page: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    euro: svg('<path d="M18 7a7 7 0 1 0 0 10M4 10h10M4 14h10"/>'),
    calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-2.82-1.18l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.25 14H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.18-2.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 10 3.25V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.18l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.75 10H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>'),
    pin: svg('<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
    book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
    monitor: svg('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    compass: svg('<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>'),
    grid: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
    search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>'),
    menu: svg('<path d="M3 6h18M3 12h18M3 18h18"/>', 20),
    spark: svg('<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>'),
  };
  const LOGO = '<span class="bhs-mark" aria-hidden="true">BH</span>';
  const CHEVRON = (open) => svg(`<polyline points="${open ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}"/>`, 14);

  function navbarHtml(o) {
    const tabs = (o.tabs || []).map((t) => (t.disabled
      ? `<span class="bhs-tab bhs-tab-disabled" title="${esc(t.title || 'Kommt in einer späteren Phase')}" aria-disabled="true">${esc(t.label)}</span>`
      : `<a class="bhs-tab${t.id === o.activeTab ? ' active' : ''}" href="${esc(t.href)}" data-bhs-link${t.id === o.activeTab ? ' aria-current="page"' : ''}>${esc(t.label)}</a>`)).join('');
    return `<button type="button" class="bhs-menu-btn" aria-label="Menü öffnen" aria-expanded="false" aria-controls="bhs-drawer">${ICONS.menu}</button><a class="bhs-logo" href="${esc(o.app.href || '/')}" data-bhs-link>${o.app.logo || LOGO}<span>${esc(o.app.name)}</span></a>${tabs}`
      + '<span class="bhs-spacer"></span>'
      + (o.adminHref ? `<a class="bhs-icon-btn" href="${esc(o.adminHref)}" title="Admin-Bereich" aria-label="Admin-Bereich" data-bhs-admin hidden>${ICONS.settings}</a>` : '')
      + '<span class="bhs-sep" aria-hidden="true"></span><span id="bhs-user" class="bhs-user"></span>';
  }

  function crumbsHtml(list) {
    return (list || []).map(([label, href], i, all) => (i === all.length - 1 || !href
      ? `<span class="bhs-crumb-current"${i === all.length - 1 ? ' aria-current="page"' : ''}>${esc(label)}</span>`
      : `<a href="${esc(href)}" data-bhs-link>${esc(label)}</a>`)).join('<span class="bhs-crumb-sep" aria-hidden="true">›</span>');
  }

  function sidebarHtml(sb, shut) {
    return `<div class="bhs-sb-head"><span class="bhs-sb-title">${esc(sb.title || '')}</span>`
      + `<button type="button" class="bhs-sb-toggle" title="Seitenleiste ein-/ausklappen" aria-label="Seitenleiste ein-/ausklappen" aria-expanded="${!shut}">${CHEVRON(!shut)}</button></div>`
      + `<nav class="bhs-sb-nav" aria-label="${esc(sb.title || 'Bereiche')}">${(sb.items || []).map((i) => `<a class="bhs-sb-item${i.id === sb.active ? ' active' : ''}" href="${esc(i.href)}" title="${esc(i.label)}" data-bhs-link${i.id === sb.active ? ' aria-current="page"' : ''}>`
        + `<span class="bhs-sb-icon">${ICONS[i.icon] || i.iconSvg || ''}</span><span class="bhs-sb-label">${esc(i.label)}</span>${i.count != null && i.count !== '' ? `<span class="bhs-sb-badge">${esc(i.count)}</span>` : ''}</a>`).join('')}</nav>`;
  }

  // Drawer (phone/tablet): the app's modules (tabs) and the sidebar entries with labels and counts.
  function drawerHtml(o, sb, activeTab) {
    const item = (href, inner, on) => `<a class="bhs-sb-item${on ? ' active' : ''}" href="${esc(href)}" data-bhs-link${on ? ' aria-current="page"' : ''}>${inner}</a>`;
    const tabs = (o.tabs || []).filter((t) => !t.disabled);
    const items = (sb && sb.items) || [];
    return `<div class="bhs-drawer-head"><span>${esc(o.app.name)}</span><button type="button" class="bhs-drawer-close" aria-label="Menü schließen">${ICONS.x}</button></div>`
      + (tabs.length ? `<div class="bhs-drawer-sec">Bereiche</div><div class="bhs-drawer-nav">${tabs.map((t) => item(t.href, `<span class="bhs-sb-label">${esc(t.label)}</span>`, t.id === activeTab)).join('')}</div>` : '')
      + (items.length ? `<div class="bhs-drawer-sec">${esc(sb.title || 'Navigation')}</div><div class="bhs-drawer-nav">${items.map((i) => item(i.href,
        `<span class="bhs-sb-icon">${ICONS[i.icon] || i.iconSvg || ''}</span><span class="bhs-sb-label">${esc(i.label)}</span>${i.count != null && i.count !== '' ? `<span class="bhs-sb-badge">${esc(i.count)}</span>` : ''}`, i.id === sb.active)).join('')}</div>` : '');
  }

  function mount(o) {
    const root = o.root || document.body;
    if (root === document.body) document.body.classList.add('bhs-active'); // full-height frame, main scrolls
    const keep = Array.from(root.childNodes).filter((n) => !(n.nodeType === 1 && /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(n.tagName)));
    const wrap = document.createElement('div');
    wrap.className = 'bhs-root';
    wrap.innerHTML = `<header class="bhs-navbar" role="banner">${navbarHtml(o)}</header><nav class="bhs-crumbs" aria-label="Brotkrumen">${crumbsHtml(o.crumbs)}</nav>`
      + '<div class="bhs-body"><aside class="bhs-sidebar" hidden></aside><main class="bhs-main" id="bhs-main"></main></div>'
      + '<div class="bhs-drawer-backdrop" hidden></div><nav class="bhs-drawer" id="bhs-drawer" aria-label="Menü" hidden></nav>';
    root.insertBefore(wrap, root.firstChild);
    const main = wrap.querySelector('.bhs-main');
    keep.forEach((n) => main.appendChild(n));
    const state = { o, sidebar: o.sidebar || null, activeTab: o.activeTab };
    wrap.classList.toggle('bhs-has-tabs', (o.tabs || []).some((t) => !t.disabled));
    const drawer = wrap.querySelector('.bhs-drawer'), backdrop = wrap.querySelector('.bhs-drawer-backdrop'), menuBtn = wrap.querySelector('.bhs-menu-btn');
    const renderDrawer = () => { drawer.innerHTML = drawerHtml(o, state.sidebar, state.activeTab); };
    function setDrawer(open) {
      drawer.hidden = !open; backdrop.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
      if (open) { const first = drawer.querySelector('.active, a'); if (first) first.focus(); } else if (drawer.contains(document.activeElement)) menuBtn.focus();
    }
    menuBtn.addEventListener('click', () => setDrawer(drawer.hidden));
    backdrop.addEventListener('click', () => setDrawer(false));
    drawer.addEventListener('click', (e) => { if (e.target.closest('.bhs-drawer-close') || e.target.closest('a[data-bhs-link]')) setDrawer(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) setDrawer(false); });
    if (window.matchMedia) window.matchMedia('(min-width: 901px)').addEventListener('change', (m) => { if (m.matches) setDrawer(false); });
    const sbEl = wrap.querySelector('.bhs-sidebar');
    const key = (s) => `bhs:${(state.sidebar && state.sidebar.key) || o.app.name}:${s}`;

    function renderSidebar() {
      const sb = state.sidebar;
      sbEl.hidden = !sb || !(sb.items || []).length;
      wrap.classList.toggle('bhs-has-sb', !sbEl.hidden);
      renderDrawer();
      if (sbEl.hidden) return;
      let shut = false;
      try { shut = localStorage.getItem(key('collapsed')) === '1'; } catch (_) { /* private mode */ }
      sbEl.classList.toggle('collapsed', shut);
      sbEl.querySelectorAll(':scope > :not(.bh-sbr-handle)').forEach((n) => n.remove());
      sbEl.insertAdjacentHTML('afterbegin', sidebarHtml(sb, shut));
      if (window.BHSidebarResize) window.BHSidebarResize.attach(sbEl, { key: key('width'), min: 180, max: 420 });
    }

    sbEl.addEventListener('click', (e) => {
      if (!e.target.closest('.bhs-sb-toggle')) return;
      const now = !sbEl.classList.contains('collapsed');
      sbEl.classList.toggle('collapsed', now);
      try { localStorage.setItem(key('collapsed'), now ? '1' : '0'); } catch (_) { /* private mode */ }
      const btn = sbEl.querySelector('.bhs-sb-toggle'); btn.innerHTML = CHEVRON(!now); btn.setAttribute('aria-expanded', String(!now));
    });
    wrap.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-bhs-link]');
      if (!a || !o.onNavigate || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (o.onNavigate(a.getAttribute('href'), e) === true) e.preventDefault();
    });

    // Benutzermenü und Admin-Zahnrad; die App liefert den Benutzer über setUser(me) aus /api/me.
    function applyUser(me) {
      if (!me) return;
      if (window.BHUserMenu) window.BHUserMenu.mount('bhs-user', { user: me, themeToggle: o.themeToggle !== false });
      const gear = wrap.querySelector('[data-bhs-admin]');
      if (gear) gear.hidden = !(me.role === 'admin');
    }
    if (o.user) applyUser(o.user);
    renderSidebar();
    // Aktuelle Sidebar-Breite als --bhs-sidebar-w, damit feste Leisten unten an der Inhaltskante beginnen.
    const sbWidth = () => wrap.style.setProperty('--bhs-sidebar-w', `${sbEl.hidden ? 0 : Math.round(sbEl.getBoundingClientRect().width)}px`);
    sbWidth();
    if (window.ResizeObserver) new ResizeObserver(sbWidth).observe(sbEl);

    return {
      root: wrap, main, sidebarEl: sbEl,
      setCrumbs(list) { wrap.querySelector('.bhs-crumbs').innerHTML = crumbsHtml(list); },
      setSidebar(patch) { state.sidebar = Object.assign({}, state.sidebar || {}, patch); renderSidebar(); sbWidth(); },
      setUser(me) { applyUser(me); },
      setActiveTab(id) { state.activeTab = id; renderDrawer(); wrap.querySelectorAll('.bhs-tab').forEach((t, i) => { const on = !t.classList.contains('bhs-tab-disabled') && (o.tabs[i] || {}).id === id; t.classList.toggle('active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); }); },
    };
  }

  window.BHAppShell = { mount, ICONS, esc };
})();
