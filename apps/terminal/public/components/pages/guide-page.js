'use strict';
/** Guide: table of contents plus the sections from guide-content.js. */
(async () => {
  const host = document.getElementById('page-host');
  AppShell.crumbs([['Terminal', `${window.APP_BASE}/`], ['Anleitung']]);
  AppShell.loading(host, 'Anleitung', 'form');
  const sections = window.GUIDE_SECTIONS;
  host.innerHTML = `<div class="guide">
    <nav class="guide-toc" aria-label="Inhalt"><div class="guide-toc-title">Inhalt</div>${sections.map((s) => `${s.group ? `<div class="guide-toc-title">${s.group}</div>` : ''}<a href="#${s.id}">${s.title}</a>`).join('')}</nav>
    <article class="guide-body"><header class="guide-head"><h1>Anleitung</h1><p>Wie das Terminal funktioniert, was OpenCode kann und wie du eigene Apps baust.</p></header><span class="guide-sr" role="status" aria-live="polite"></span>
    ${sections.map((s) => `<section id="${s.id}"><h2>${s.title}</h2>${s.html}</section>`).join('')}</article></div>`;
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('.guide-copy');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.parentElement.querySelector('code').textContent);
      btn.textContent = 'Kopiert';
      host.querySelector('.guide-sr').textContent = 'Kopiert';
    } catch (err) { btn.textContent = 'Bitte von Hand kopieren'; }
    setTimeout(() => { btn.textContent = 'Kopieren'; }, 1500);
  });

  const links = new Map([...host.querySelectorAll('.guide-toc a')].map((a) => [a.getAttribute('href').slice(1), a]));
  const toc = host.querySelector('.guide-toc');
  const mark = (id) => {
    links.forEach((a) => a.removeAttribute('aria-current'));
    const a = links.get(id);
    if (a) { a.setAttribute('aria-current', 'true'); toc.scrollLeft = a.offsetLeft - toc.offsetLeft - 16; }
  };
  mark(sections[0].id);
  const spy = new IntersectionObserver((entries) => { const hit = entries.find((e) => e.isIntersecting); if (hit) mark(hit.target.id); }, { rootMargin: '-15% 0px -75% 0px' });
  host.querySelectorAll('.guide-body > section').forEach((s) => spy.observe(s));

  try { Navbar.render('guide', await TerminalApi.me()); } catch (e) { Navbar.render('guide'); }
})();
