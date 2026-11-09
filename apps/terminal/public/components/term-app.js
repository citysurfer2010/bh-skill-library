'use strict';
/** Terminal UI: tabs, upload, sidebars and keys. */
window.TermApp = (() => {
  const BASE = window.APP_BASE;
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(`bh-term-${k}`)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(`bh-term-${k}`, JSON.stringify(v)); } catch (e) { /* convenience only */ } } };
  const KEYS = [['Esc', '\x1b'], ['Tab', '\t'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['←', '\x1b[D'], ['→', '\x1b[C'], ['Strg+C', '\x03'], ['Strg+D', '\x04']];
  const LAYOUT = `<div class="term-page"><div class="term-bar"><div class="term-tabs" role="tablist" aria-label="Sitzungen"></div><button class="term-btn" data-a="new" aria-label="Neue Sitzung">+</button><span class="term-spacer"></span><button class="term-btn primary" data-a="opencode">opencode starten</button><button class="term-btn" data-a="files" aria-expanded="false">Dateien</button><button class="term-btn" data-a="apps" aria-expanded="false">Meine Apps</button><button class="term-btn term-more-only" data-a="more" aria-label="Mehr" aria-expanded="false">⋯</button><button class="term-btn term-extra" data-a="find">Suchen</button><button class="term-btn term-extra" data-a="smaller" aria-label="Schrift kleiner">A−</button><button class="term-btn term-extra" data-a="bigger" aria-label="Schrift größer">A+</button></div><div class="term-search" hidden><input aria-label="Im Terminal suchen" placeholder="Im Terminal suchen"><button class="term-btn" data-a="prev" aria-label="Vorheriger Treffer">↑</button><button class="term-btn" data-a="next" aria-label="Nächster Treffer">↓</button><button class="term-btn" data-a="find">Schließen</button></div><div class="term-banner" role="status" hidden>Verbindung unterbrochen, wird wiederhergestellt …</div><div class="term-stage"><div class="term-views"></div><aside class="term-panel" hidden></aside></div><div class="term-keys"></div><div class="term-toast" role="status" aria-live="polite" hidden></div><div class="term-toast undo" role="status" hidden></div></div>`;

  function start(host) {
    host.innerHTML = LAYOUT;
    const page = host.firstChild; const $ = (s) => page.querySelector(s);
    const views = $('.term-views'); const panel = $('.term-panel'); const tabsEl = $('.term-tabs'); const search = $('.term-search'); const toastEl = $('.term-toast:not(.undo)'); const undoEl = $('.term-toast.undo'); const banner = $('.term-banner');
    const sessions = new Map(); const meta = new Map(); let active = null; let font = store.get('font', 14); let openPanel = null;
    const current = () => sessions.get(active);
    const saveTabs = () => store.set('tabs', [...meta.entries()].filter(([, m]) => !m.leaving).map(([id, m]) => ({ id, label: m.label })));
    let toastTimer; const toast = (html, ms) => { clearTimeout(toastTimer); toastEl.innerHTML = html; toastEl.hidden = false; if (ms) toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms); };

    const visible = () => [...meta.entries()].filter(([, m]) => !m.leaving);
    function drawTabs() {
      const hadFocus = tabsEl.contains(document.activeElement);
      tabsEl.innerHTML = visible().map(([id, m], i) => `<div class="term-tab ${id === active ? 'on' : ''}"><button class="name" role="tab" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}" data-tab="${id}" title="${m.state === 'open' ? 'Verbunden' : m.state === 'connecting' ? 'Verbindet …' : 'Getrennt'}"><i class="term-dot ${m.state === 'open' ? 'open' : ''}"></i>${AppShell.esc(m.label || `Sitzung ${i + 1}`)}</button>${visible().length > 1 ? `<button class="x" data-kill="${id}" aria-label="${AppShell.esc(m.label || `Sitzung ${i + 1}`)} beenden">✕</button>` : ''}</div>`).join('');
      if (hadFocus) tabsEl.querySelector('[aria-selected="true"]')?.focus();
      banner.hidden = !active || meta.get(active)?.state !== 'wait';
    }
    const setState = (id, s) => { if (meta.has(id)) { meta.get(id).state = s; drawTabs(); } };
    function focus(id) { active = id; sessions.forEach((s, k) => s.show(k === id)); drawTabs(); }
    function open(id = Math.random().toString(36).slice(2, 8), label = '') { meta.set(id, { label, state: 'connecting' }); sessions.set(id, TermSession.create({ id, parent: views, fontSize: font, onState: setState })); saveTabs(); focus(id); return sessions.get(id); }
    // Five seconds to undo; only then is the session really ended.
    let pending = null;
    const finish = ({ id, timer }) => { clearTimeout(timer); sessions.get(id).kill(); sessions.delete(id); meta.delete(id); pending = null; };
    function kill(id) {
      if (pending) finish(pending); // There is only ever one undo; the older session ends immediately.
      const m = meta.get(id); m.leaving = true; saveTabs();
      if (active === id) focus(visible().pop()[0]); else drawTabs();
      undoEl.innerHTML = `<span>${AppShell.esc(m.label || 'Sitzung')} wird beendet</span><button class="term-btn" data-undo>Rückgängig</button>`; undoEl.hidden = false;
      const entry = { id, timer: setTimeout(() => { finish(entry); undoEl.hidden = true; }, 5000) }; pending = entry;
      undoEl.onclick = (e) => { if (e.target.dataset.undo === undefined) return; clearTimeout(entry.timer); pending = null; delete m.leaving; saveTabs(); focus(id); undoEl.hidden = true; };
    }
    const tools = () => page.querySelectorAll('[data-a=files],[data-a=apps]');
    function closePanel() { panel.hidden = true; openPanel = null; tools().forEach((b) => b.setAttribute('aria-expanded', 'false')); current().focus(); }
    function lightbox(src, name) { const l = document.createElement('div'); l.className = 'term-light'; l.setAttribute('role', 'dialog'); l.innerHTML = `<button class="term-btn">Schließen</button><img src="${src}" alt="${AppShell.esc(name)}">`; l.onclick = () => l.remove(); views.appendChild(l); l.querySelector('button').focus(); }

    async function upload(list) {
      if (!list.length) return;
      if (list.length > 2) { toast('Bitte höchstens zwei Dateien auf einmal.', 4000); return; }
      const body = new FormData(); list.forEach((f, i) => body.append('file', f, f.name || `bild-${i + 1}.png`));
      toast('Wird hochgeladen …');
      try {
        const { files } = await TermPanels.api('upload', { method: 'POST', body });
        current().paste(`${files.map((f) => TermPanels.quote(f.path)).join(' ')} `); current().focus();
        const img = files.find((f) => f.image);
        toast(`${img ? `<img alt="" src="${BASE}/api/files/${encodeURIComponent(img.name)}">` : ''}<span>Pfad im Terminal eingefügt</span>`, 4000);
      } catch (e) { toast(AppShell.esc(e.message), 5000); }
    }
    document.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); e.stopPropagation(); upload(f); } }, true);
    let depth = 0; let drop = null;
    const endDrag = () => { depth = 0; if (drop) { drop.remove(); drop = null; } };
    page.addEventListener('dragenter', (e) => { e.preventDefault(); depth += 1; if (!drop) { drop = document.createElement('div'); drop.className = 'term-drop'; drop.textContent = 'Loslassen zum Einfügen'; views.appendChild(drop); } });
    page.addEventListener('dragover', (e) => e.preventDefault());
    page.addEventListener('dragleave', () => { depth -= 1; if (depth <= 0) endDrag(); });
    page.addEventListener('drop', (e) => { e.preventDefault(); endDrag(); upload([...e.dataTransfer.files]); });

    const setFont = (n) => { font = Math.min(28, Math.max(10, n)); store.set('font', font); sessions.forEach((s) => s.font(font)); };
    const toggleFind = () => { search.hidden = !search.hidden; if (!search.hidden) search.querySelector('input').focus(); else current().focus(); };
    function togglePanel(name, run) {
      if (openPanel === name) { closePanel(); return; }
      openPanel = name; tools().forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.a === name))); run();
    }
    const q = () => search.querySelector('input').value;
    const ACTIONS = {
      new: () => open(),
      opencode: () => { const had = visible().find(([, m]) => m.label === 'opencode'); if (had) focus(had[0]); else open(undefined, 'opencode').type('opencode\r'); },
      files: () => togglePanel('files', () => TermPanels.files(panel, { current, close: closePanel, lightbox, upload, toast })),
      apps: () => togglePanel('apps', () => TermPanels.apps(panel, { close: closePanel, toast })),
      more: () => { const on = $('.term-bar').classList.toggle('more'); page.querySelector('[data-a=more]').setAttribute('aria-expanded', String(on)); }, find: toggleFind, smaller: () => setFont(font - 1), bigger: () => setFont(font + 1), next: () => current().find(q()), prev: () => current().find(q(), true),
    };
    page.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kill],[data-tab],[data-a]'); if (!b) return;
      if (b.dataset.kill) kill(b.dataset.kill); else if (b.dataset.tab) focus(b.dataset.tab); else ACTIONS[b.dataset.a]();
    });
    tabsEl.addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const ids = visible().map(([id]) => id); const i = ids.indexOf(active) + (e.key === 'ArrowRight' ? 1 : -1); focus(ids[(i + ids.length) % ids.length]); tabsEl.querySelector('[aria-selected="true"]').focus(); });
    search.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') ACTIONS[e.shiftKey ? 'prev' : 'next'](); if (e.key === 'Escape') toggleFind(); });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFind(); return; }
      if (e.key !== 'Escape') return;
      const light = views.querySelector('.term-light');
      if (light) { e.preventDefault(); e.stopPropagation(); light.remove(); } else if (openPanel) { e.preventDefault(); e.stopPropagation(); closePanel(); }
    }, true);
    const keys = $('.term-keys'); keys.innerHTML = KEYS.map(([l], i) => `<button class="term-btn" data-k="${i}">${l}</button>`).join('');
    keys.addEventListener('click', (e) => { const i = e.target.dataset.k; if (i !== undefined) { current().type(KEYS[i][1]); current().focus(); } });
    const size = () => document.documentElement.style.setProperty('--term-vh', `${window.visualViewport.height}px`);
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', size); size(); }
    const saved = store.get('tabs', []).map((t) => (typeof t === 'string' ? { id: t, label: '' } : t)).filter((t) => /^[a-z0-9]{1,12}$/.test(t.id));
    (saved.length ? saved : [{}]).forEach((t) => open(t.id, t.label || ''));
  }
  return { start };
})();
