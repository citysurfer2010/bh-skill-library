'use strict';
/** Seitenleisten des Terminals: Dateien und eigene Apps. */
window.TermPanels = (() => {
  const BASE = window.APP_BASE; const esc = (s) => AppShell.esc(s);
  const quote = (p) => `'${p.replace(/'/g, `'\\''`)}'`;
  const api = async (url, opts) => { const r = await fetch(`${BASE}/api/${url}`, opts); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Das hat nicht geklappt'); return j; };
  const head = (title) => `<h2>${title} <button class="term-btn" data-close>Schließen</button></h2>`;
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const pretty = (n) => n.replace(/^\d{14}-/, '');
  // Löschen braucht zwei Klicks: Beim ersten fragt der Knopf nach.
  function confirmClick(btn, run) {
    if (btn.dataset.sure) { run(); return; }
    btn.dataset.sure = '1'; const text = btn.textContent; btn.textContent = 'Wirklich?'; btn.classList.add('danger');
    setTimeout(() => { delete btn.dataset.sure; btn.textContent = text; btn.classList.remove('danger'); }, 3000);
  }

  async function files(panel, { current, close, lightbox, upload, toast }) {
    panel.hidden = false;
    panel.innerHTML = `${head('Dateien')}<p>Wird geladen …</p>`;
    const render = (list) => {
      panel.innerHTML = `${head('Dateien')}<label class="term-btn primary">Bild oder Datei hochladen<input type="file" multiple data-pick></label>${list.length ? `<ul class="term-files">${list.map((f) => `<li>${f.image ? `<button class="term-thumb" data-view="${esc(f.name)}" aria-label="${esc(pretty(f.name))} ansehen"><img loading="lazy" alt="" src="${BASE}/api/files/${encodeURIComponent(f.name)}"></button>` : '<span class="term-thumb none">Datei</span>'}<div class="term-meta"><b title="${esc(f.name)}">${esc(pretty(f.name))}</b><small>${new Date(f.at * 1000).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</small><div class="term-actions"><button class="term-btn" data-insert="${esc(f.path)}">Pfad einfügen</button>${f.image ? `<button class="term-btn" data-show="${esc(f.path)}" title="Führt bh-show im aktiven Tab aus. Dort muss die Eingabezeile bereit sein.">Anzeigen</button>` : ''}<button class="term-btn" data-del="${esc(f.name)}">Löschen</button></div></div></li>`).join('')}</ul>` : `<p class="term-hint">Noch nichts hochgeladen. ${touch() ? 'Tippe auf Bild oder Datei hochladen.' : 'Zieh ein Bild ins Terminal oder füge es mit Strg+V ein.'}</p>`}`;
    };
    const load = async () => render((await api('files')).files);
    const done = (m) => { if (matchMedia('(max-width: 960px)').matches) close(); else { toast(m, 2000); current().focus(); } };
    panel.onchange = async (e) => { if (e.target.dataset.pick !== undefined) { await upload([...e.target.files]); load().catch(() => {}); } };
    panel.onclick = async (e) => {
      const el = e.target.closest('button'); if (!el) return;
      const d = el.dataset;
      if (d.close !== undefined) close();
      else if (d.view) lightbox(`${BASE}/api/files/${encodeURIComponent(d.view)}`, pretty(d.view));
      else if (d.insert) { current().paste(`${quote(d.insert)} `); done('Pfad eingefügt'); }
      else if (d.show) { current().type(`bh-show ${quote(d.show)}\r`); done('Im aktiven Tab angezeigt'); }
      else if (d.del) confirmClick(el, async () => { try { await api(`files/${encodeURIComponent(d.del)}`, { method: 'DELETE' }); load(); } catch (err) { toast(esc(err.message), 4000); } });
    };
    try { await load(); } catch (err) { panel.innerHTML = `${head('Dateien')}<p class="term-error">${esc(err.message)}</p>`; }
  }

  async function apps(panel, { close, toast }) {
    panel.hidden = false;
    let data = { routes: [], subdomain: '' };
    panel.innerHTML = `${head('Meine Apps')}<div data-site></div><p>Starte deine App im Terminal und lege fest, unter welchem Pfad sie erreichbar ist.</p><form class="term-form"><label>Pfad<input name="path" required aria-describedby="route-help"></label><label>Port deiner App<input name="port" type="number" min="1024" max="65535" required aria-describedby="route-help"></label><p class="term-hint" id="route-help">Zum Beispiel /spiel und die Zahl, die dein Programm beim Start nennt, etwa 3000.</p><button class="term-btn primary">Hinzufügen</button><p class="term-error" data-err role="alert" hidden></p></form><ul class="term-routes" data-list><li class="term-hint">Wird geladen …</li></ul>`;
    const url = () => (data.subdomain ? `https://${data.subdomain}` : '');
    const list = panel.querySelector('[data-list]'); const err = panel.querySelector('[data-err]');
    const fail = (m) => { err.textContent = m; err.hidden = !m; };
    const draw = () => {
      panel.querySelector('[data-site]').innerHTML = url() ? `<div class="term-link"><a href="${esc(url())}" target="_blank" rel="noopener">${esc(data.subdomain)}</a><button class="term-btn" data-copy="${esc(url())}">Kopieren</button></div>` : '';
      list.innerHTML = data.routes.length ? data.routes.map((r) => `<li><div class="top"><a href="${esc(url() + r.path)}" target="_blank" rel="noopener">${esc(r.path)}</a><button class="term-btn" data-del="${esc(r.path)}">Entfernen</button></div><span class="term-up ${r.up ? 'on' : r.up === false ? 'off' : ''}">Port ${Number(r.port)} · ${r.up === undefined ? 'wird geprüft' : r.up ? 'läuft' : 'nicht erreichbar'}</span></li>`).join('') : '<li class="term-hint">Noch keine App freigegeben. Starte sie im Terminal und trage hier Pfad und Port ein.</li>';
    };
    const reload = async () => { data = await api('apps'); draw(); };
    panel.onclick = async (e) => {
      const el = e.target.closest('button'); if (!el) return;
      if (el.dataset.close !== undefined) close();
      else if (el.dataset.copy) { await navigator.clipboard?.writeText(el.dataset.copy); toast('Adresse kopiert', 2000); }
      else if (el.dataset.del) confirmClick(el, async () => { try { await api(`apps?path=${encodeURIComponent(el.dataset.del)}`, { method: 'DELETE' }); await reload(); } catch (x) { fail(x.message); } });
    };
    panel.onsubmit = async (e) => {
      e.preventDefault(); fail(''); const f = new FormData(e.target);
      try { await api('apps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: f.get('path'), port: Number(f.get('port')) }) }); e.target.reset(); await reload(); } catch (x) { fail(x.message); }
    };
    try { await reload(); } catch (x) { list.innerHTML = ''; fail(x.message); }
  }
  return { files, apps, api, quote };
})();
