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

  const ADVICE = {
    secret: 'Geheimnis aus dem Code entfernen und als Umgebungsvariable setzen:',
    'exposed-env': '.env darf nicht ausgeliefert werden: aus dem Web-Ordner der App entfernen',
    'exposed-git': 'Den Ordner .git nicht mit ausliefern',
    'exposed-source': 'Quelldateien nicht ausliefern, nur den Web-Ordner freigeben:',
    'leak-in-page': 'In der ausgelieferten Seite steht ein Geheimnis: entfernen',
    'sensitive-file': 'Sensible Datei aus dem App-Ordner entfernen:',
    'gateway-access': 'KI- oder MCP-Zugriff aus öffentlichen Apps entfernen, sonst könnte jeder deine Kosten auslösen:',
    'not-running': 'Die App antwortet nicht: im Terminal starten',
    'no-folder': 'Ordner der App angeben, er wurde nicht gefunden',
    'scan-failed': 'Die Prüfung konnte nicht laufen, sie wird wiederholt',
  };
  async function apps(panel, { close, toast }) {
    panel.hidden = false;
    let data = { routes: [], subdomain: '' };
    panel.innerHTML = `${head('Meine Apps')}<div data-site></div><p>Starte deine App im Terminal und lege fest, unter welchem Pfad sie erreichbar ist.</p><form class="term-form"><label>Pfad<input name="path" required aria-describedby="route-help"></label><label>Port deiner App<input name="port" type="number" min="1024" max="65535" required aria-describedby="route-help"></label><p class="term-hint" id="route-help">Zum Beispiel /spiel und die Zahl, die dein Programm beim Start nennt, etwa 3000.</p><button class="term-btn primary">Hinzufügen</button><p class="term-error" data-err role="alert" hidden></p></form><ul class="term-routes" data-list><li class="term-hint">Wird geladen …</li></ul>`;
    const url = () => (data.subdomain ? `https://${data.subdomain}` : '');
    const list = panel.querySelector('[data-list]'); const err = panel.querySelector('[data-err]');
    const fail = (m) => { err.textContent = m; err.hidden = !m; };
    const draw = () => {
      panel.querySelector('[data-site]').innerHTML = url() ? `<div class="term-link"><a href="${esc(url())}" target="_blank" rel="noopener">${esc(data.subdomain)}</a><button class="term-btn" data-copy="${esc(url())}">Kopieren</button></div>` : '';
      list.innerHTML = data.routes.length ? data.routes.map((r) => `<li><div class="top"><a href="${esc(url() + r.path)}" target="_blank" rel="noopener">${esc(r.path)}</a><button class="term-btn" data-del="${esc(r.path)}">Entfernen</button></div><span class="term-up ${r.up ? 'on' : r.up === false ? 'off' : ''}">Port ${Number(r.port)} · ${r.up === undefined ? 'wird geprüft' : r.up ? 'läuft' : 'nicht erreichbar'}</span>${publicRow(r)}</li>`).join('') : '<li class="term-hint">Noch keine App freigegeben. Starte sie im Terminal und trage hier Pfad und Port ein.</li>';
    };
    const publicRow = (r) => {
      if (!r.public) return `<div class="term-pub"><span class="term-hint">Nur mit Anmeldung erreichbar</span><button class="term-btn" data-public="${esc(r.path)}">Öffentlich machen</button></div>`;
      const g = r.guard;
      if (!g) return `<div class="term-pub"><span class="term-state" role="status">Wird geprüft, dauert bis zu 5 Minuten</span><button class="term-btn" data-private="${esc(r.path)}">Abbrechen</button></div>`;
      if (g.state === 'ok') return `<div class="term-pub"><span class="term-state ok" role="status">✓ Öffentlich, Prüfung bestanden</span><button class="term-btn" data-private="${esc(r.path)}">Nicht mehr öffentlich</button></div>`;
      const n = g.findings.length;
      return `<div class="term-pub"><span class="term-state off" role="status">Nicht veröffentlicht: ${n === 1 ? '1 Punkt' : `${n} Punkte`} beheben</span><button class="term-btn" data-private="${esc(r.path)}">Abbrechen</button></div><ul class="term-finds">${g.findings.map((f) => `<li>${esc(ADVICE[f.rule] || ADVICE.secret)}${f.file && f.file !== '.env' ? ` <code>${esc(f.file)}</code>` : ''}</li>`).join('')}</ul><span class="term-hint">Nach dem Beheben prüft der Wächter von selbst neu, spätestens nach 5 Minuten.</span>`;
    };
    const askFolder = (route) => { const li = list.querySelector(`[data-public="${CSS.escape(route)}"]`).closest('.term-pub'); li.outerHTML = `<form class="term-form" data-pubform="${esc(route)}"><label>Ordner der App<input name="dir" required aria-describedby="pub-help"></label><p class="term-hint" id="pub-help">Zum Beispiel projects/spiel. Erst nach bestandener Sicherheitsprüfung ist die App öffentlich, das dauert bis zu 5 Minuten.</p><button class="term-btn primary">Prüfen und veröffentlichen</button></form>`; list.querySelector('[data-pubform] input').focus(); };
    const setPublic = async (path, on, dir) => { await api('apps/public', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, on, dir }) }); await reload(); };
    const reload = async (background) => { data = await api('apps'); if (!background || (!list.querySelector('[data-pubform]') && !list.contains(document.activeElement))) draw(); };
    clearInterval(panel.bhPoll);
    panel.bhPoll = setInterval(() => { if (panel.hidden || !list.isConnected) { clearInterval(panel.bhPoll); return; } if (data.routes.some((r) => r.public && (!r.guard || r.guard.state !== 'ok'))) reload(true).catch(() => {}); }, 10000);
    panel.onclick = async (e) => {
      const el = e.target.closest('button'); if (!el) return;
      if (el.dataset.close !== undefined) close();
      else if (el.dataset.public) askFolder(el.dataset.public);
      else if (el.dataset.private) { try { await setPublic(el.dataset.private, false); } catch (x) { fail(x.message); } }
      else if (el.dataset.copy) { await navigator.clipboard?.writeText(el.dataset.copy); toast('Adresse kopiert', 2000); }
      else if (el.dataset.del) confirmClick(el, async () => { try { await api(`apps?path=${encodeURIComponent(el.dataset.del)}`, { method: 'DELETE' }); await reload(); } catch (x) { fail(x.message); } });
    };
    panel.onsubmit = async (e) => {
      e.preventDefault(); fail(''); const f = new FormData(e.target);
      if (e.target.dataset.pubform) { try { await setPublic(e.target.dataset.pubform, true, f.get('dir')); } catch (x) { fail(x.message); } return; }
      try { await api('apps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: f.get('path'), port: Number(f.get('port')) }) }); e.target.reset(); await reload(); } catch (x) { fail(x.message); }
    };
    try { await reload(); } catch (x) { list.innerHTML = ''; fail(x.message); }
  }
  return { files, apps, api, quote };
})();
