'use strict';
/** Web terminal: waits for the workspace, loads xterm and starts the UI. */
(async () => {
  const BASE = window.APP_BASE; const host = document.getElementById('page-host');
  const VENDOR = ['xterm/lib/xterm', 'addon-fit/lib/addon-fit', 'addon-webgl/lib/addon-webgl', 'addon-search/lib/addon-search', 'addon-web-links/lib/addon-web-links', 'addon-image/lib/addon-image', 'addon-unicode11/lib/addon-unicode11', 'addon-clipboard/lib/addon-clipboard'];
  const script = (s) => new Promise((ok, no) => { const e = document.createElement('script'); e.src = `${BASE}/vendor/${s}.js`; e.onload = ok; e.onerror = () => no(new Error('Laden fehlgeschlagen')); document.head.appendChild(e); });
  const LONG_MS = 120_000;

  function view(html) { host.innerHTML = `<div class="term-wait" role="status">${html}</div>`; }
  const retry = '<button class="term-btn primary" onclick="location.reload()">Erneut versuchen</button>';
  const spinner = (title, text) => view(`<div class="term-spin" aria-hidden="true"></div><h1>${title}</h1><p>${text}</p>`);

  try {
    AppShell.crumbs([['Terminal']]);
    AppShell.loading(host, 'Terminal', 'form');
    Navbar.render('home', await TerminalApi.me());
    document.body.classList.add('term-body');

    let status = await TermPanels.api('status'); const began = Date.now(); let shown = '';
    while (status.state !== 'ready') {
      const key = status.state === 'failed' ? 'failed' : Date.now() - began > LONG_MS ? 'long' : 'wait';
      if (key !== shown) {
        shown = key;
        if (key === 'failed') view(`<h1>Die Umgebung konnte nicht angelegt werden</h1><p>In wenigen Minuten versucht es das System von selbst noch einmal.</p>${retry}`);
        else if (key === 'long') spinner('Umgebung wird vorbereitet …', 'Das dauert länger als üblich. Die Seite öffnet sich von selbst.');
        else spinner('Umgebung wird vorbereitet …', 'Beim ersten Mal dauert das etwa eine Minute. Die Seite öffnet sich von selbst.');
      }
      await new Promise((r) => setTimeout(r, 3000));
      status = await TermPanels.api('status').catch(() => status);
    }
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `${BASE}/vendor/xterm/css/xterm.css`; document.head.appendChild(css);
    for (const s of VENDOR) await script(s);
    TermApp.start(host);
  } catch (e) {
    view(`<h1>Das Terminal konnte nicht geladen werden</h1><p>${AppShell.esc(e.message)}</p>${retry}`);
  }
})();
