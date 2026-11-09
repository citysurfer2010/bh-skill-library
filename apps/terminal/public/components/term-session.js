'use strict';
/** A terminal tab: xterm in the browser, connected by WebSocket to a tmux session in the user's own container. */
window.TermSession = (() => {
  const BASE = window.APP_BASE;
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const theme = () => ({ background: token('--bh-term-bg'), foreground: token('--bh-term-fg'), cursor: token('--bh-term-cursor'), selectionBackground: token('--bh-term-select') });

  function create({ id, parent, fontSize, onState }) {
    const view = document.createElement('div');
    view.className = 'term-view'; view.hidden = true; parent.appendChild(view);
    const term = new window.Terminal({ fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace', fontSize, cursorBlink: true, scrollback: 20000, allowProposedApi: true, macOptionIsMeta: true, theme: theme() });
    const fit = new window.FitAddon.FitAddon(); const search = new window.SearchAddon.SearchAddon();
    term.loadAddon(fit); term.loadAddon(search);
    term.loadAddon(new window.WebLinksAddon.WebLinksAddon());
    term.loadAddon(new window.ClipboardAddon.ClipboardAddon());
    term.loadAddon(new window.Unicode11Addon.Unicode11Addon()); term.unicode.activeVersion = '11';
    term.open(view);
    term.loadAddon(new window.ImageAddon.ImageAddon({ sixelSupport: true, iipSupport: true, storageLimit: 128 }));
    try { const gl = new window.WebglAddon.WebglAddon(); gl.onContextLoss(() => gl.dispose()); term.loadAddon(gl); } catch (e) { /* render without WebGL */ }

    let ws = null; let closed = false; let tries = 0; let queue = [];
    const raw = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else queue.push(m); };
    const refit = () => { if (view.hidden) return; try { fit.fit(); raw({ t: 'r', c: term.cols, r: term.rows }); } catch (e) { /* not visible yet */ } };

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}${BASE}/ws?s=${id}&c=${term.cols}&r=${term.rows}`);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { tries = 0; onState(id, 'open'); const q = queue; queue = []; q.forEach(raw); refit(); };
      ws.onmessage = (e) => term.write(new Uint8Array(e.data));
      ws.onclose = (e) => {
        if (closed) return;
        if (e.code === 4401) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
        onState(id, 'wait'); tries += 1;
        setTimeout(connect, Math.min(500 * 2 ** tries, 5000));
      };
    }
    term.onData((d) => raw({ t: 'i', d }));
    new ResizeObserver(refit).observe(view);
    connect();

    return {
      id, term,
      show(on) { view.hidden = !on; if (on) { refit(); term.focus(); } },
      focus: () => term.focus(),
      type: (text) => raw({ t: 'i', d: text }),
      paste: (text) => term.paste(text),
      find: (q, back) => (back ? search.findPrevious(q) : search.findNext(q)),
      font(n) { term.options.fontSize = n; refit(); },
      retheme() { term.options.theme = theme(); },
      kill() { closed = true; raw({ t: 'k' }); setTimeout(() => { try { ws.close(); } catch (e) { /* closed */ } term.dispose(); view.remove(); }, 150); },
    };
  }
  return { create };
})();
