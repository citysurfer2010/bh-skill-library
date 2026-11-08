'use strict';
/** Bedienseite des Beamers. Status oben, Inhalte links, Fernbedienung rechts; am Handy untereinander (Reihenfolge in beamer.css). */
(async () => {
  const esc = AppShell.esc;
  const host = document.getElementById('page-host');
  const STATE = { on: 'An', standby: 'Aus (Standby)', 'nicht erreichbar': 'Aus oder nicht erreichbar' };
  const PAD = [['', ''], ['KEY_UP', '▲', 'Hoch'], ['', ''], ['KEY_LEFT', '◀', 'Links'], ['KEY_ENTER', 'OK', 'Bestätigen'], ['KEY_RIGHT', '▶', 'Rechts'], ['KEY_RETURN', 'Zurück', 'Zurück'], ['KEY_DOWN', '▼', 'Runter'], ['KEY_HOME', 'Home', 'Startseite']];
  const EXTRA = [['KEY_VOLDOWN', 'Leiser'], ['KEY_MUTE', 'Stumm'], ['KEY_VOLUP', 'Lauter'], ['KEY_PLAY', 'Play'], ['KEY_PAUSE', 'Pause']];
  let now = null; let zustand = null;

  const section = (title, body, extra = '') => `<section class="bm-section"><div class="bm-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
  const moodTile = (m) => `<button class="bm-mood" data-send="/mood" data-body='${esc(JSON.stringify({ id: m.id }))}' data-now="mood:${esc(m.id)}"><img src="${esc(m.thumb)}" alt="" loading="lazy"><span>${esc(m.label)}</span></button>`;
  const stationTile = (s) => `<button class="bm-station" data-send="/radio" data-body='${esc(JSON.stringify({ id: s.id }))}' data-now="radio:${esc(s.id)}">${esc(s.label)}</button>`;
  const form = (id, label, name, placeholder, cta, type = 'text') => `<form class="bm-form" data-form="${id}"><label class="bh-label" for="f-${id}">${label}</label><div class="bm-row"><input id="f-${id}" class="bh-input" name="${name}" type="${type}" placeholder="${placeholder}" required autocomplete="off"><button class="bh-btn bh-btn-primary">${cta}</button></div></form>`;

  function page(c) {
    return `<header class="app-topbar"><div><h1>Beamer</h1><div class="sub" id="bm-status" aria-live="polite">Status wird geladen …</div></div>
      <div class="app-topbar-actions"><button class="bh-btn" data-power="on">Einschalten</button><button class="bh-btn bh-btn-danger" data-power="off">Ausschalten</button></div></header>
      <div class="bm-layout"><div class="bm-main">
        ${section('Stimmung', `<div class="bm-moods">${c.moods.map(moodTile).join('')}</div>`)}
        ${section('Radio', `<div class="bm-stations">${c.stations.map(stationTile).join('')}</div>`, '<button class="bh-btn bh-btn-sm" data-send="/radio/stop" data-body="{}">Radio aus</button>')}
        ${section('Vom Laptop zeigen', `<div class="bm-share"><button class="bh-btn bh-btn-primary" data-share="screen" ${BeamerShare.canScreen() ? '' : 'disabled'}>Bildschirm teilen</button><button class="bh-btn" data-share="camera">Kamera zeigen</button><button class="bh-btn" data-share="stop" hidden>Beenden</button></div><p class="bm-hint" id="bm-share-state" aria-live="polite">Der Laptop muss im Heimnetz sein.</p>`)}
        ${section('Eigene Inhalte', `<div class="bm-forms">${form('youtube', 'YouTube-Link', 'video', 'https://www.youtube.com/watch?v=…', 'Abspielen')}${form('text', 'Text anzeigen', 'title', 'Hallo zusammen', 'Anzeigen')}${form('url', 'Webseite öffnen', 'url', 'https://…', 'Öffnen', 'url')}</div>`)}
      </div><aside class="bm-side">
        ${section('Fernbedienung', `<div class="bm-pad">${PAD.map(([k, l, a]) => (k ? `<button class="bm-key" data-key="${k}" aria-label="${a}">${l}</button>` : '<span></span>')).join('')}</div><div class="bm-extra">${EXTRA.map(([k, l]) => `<button class="bh-btn" data-key="${k}">${l}</button>`).join('')}</div>`)}
        ${section('Apps', `<div class="bm-apps">${c.apps.map((a) => `<button class="bh-btn" data-send="/app" data-body='${esc(JSON.stringify({ app: a }))}'>${esc(a)}</button>`).join('')}</div>`)}
      </aside></div>`;
  }

  function paint() {
    const el = document.getElementById('bm-status');
    if (!el) return;
    const state = STATE[zustand] || zustand || '…';
    el.textContent = now ? `${state} · Läuft: ${now.label}` : state;
    host.querySelectorAll('[data-now]').forEach((b) => b.classList.toggle('is-active', !!now && b.dataset.now === `${now.kind}:${now.id}`));
    host.querySelectorAll('[data-power]').forEach((b) => { b.disabled = zustand === (b.dataset.power === 'on' ? 'on' : 'standby'); });
  }

  async function refresh() {
    try { ({ zustand, now } = await BeamerApi.status()); paint(); } catch { /* nächster Versuch */ }
  }

  async function busy(el, work) {
    el.setAttribute('aria-busy', 'true'); el.disabled = true;
    try { return await work(); } catch (e) { Toast.error(e.message || 'Hat nicht geklappt'); return null; } finally { el.removeAttribute('aria-busy'); el.disabled = false; paint(); }
  }
  async function send(el, path, body, ok) {
    const r = await busy(el, () => BeamerApi.send(path, body));
    if (!r) return false;
    if ('now' in r) { now = r.now; paint(); }
    if (ok) Toast.success(ok);
    return true;
  }

  const SHARE_TEXT = { connecting: 'Verbinde mit dem Beamer …', live: 'Wird auf dem Beamer gezeigt.', ended: 'Freigabe beendet.', failed: 'Keine Verbindung zum Beamer. Ist der Laptop im Heimnetz?' };
  function shareState(s) {
    document.getElementById('bm-share-state').textContent = SHARE_TEXT[s];
    host.querySelector('[data-share="stop"]').hidden = s === 'ended' || s === 'failed';
    if (s === 'ended' || s === 'failed') { now = null; paint(); }
  }
  async function share(b) {
    if (b.dataset.share === 'stop') { await busy(b, () => BeamerShare.stop()); shareState('ended'); return; }
    try { await BeamerShare.start(b.dataset.share, shareState); now = { kind: 'share', label: 'Bildschirmfreigabe' }; paint(); }
    catch (e) { shareState('ended'); if (e.name !== 'NotAllowedError') Toast.error(e.message || 'Freigabe nicht möglich'); }
  }

  host.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.share) return share(b);
    if (b.dataset.key) return send(b, '/key', { key: b.dataset.key });
    if (b.dataset.power) { const on = b.dataset.power === 'on'; if (await send(b, '/power', { state: b.dataset.power }, on ? 'Beamer ist an' : 'Beamer ist aus')) refresh(); return; }
    if (b.dataset.send) return send(b, b.dataset.send, JSON.parse(b.dataset.body), b.textContent.trim().slice(0, 40));
  });
  host.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const input = f.querySelector('input');
    if (await send(f.querySelector('button'), `/${f.dataset.form}`, { [input.name]: input.value }, 'Wird auf dem Beamer gezeigt')) input.value = '';
  });

  try {
    Navbar.render('home', null);
    AppShell.loading(host, 'Beamer');
    const [me, catalog] = await Promise.all([BeamerApi.me(), BeamerApi.catalog()]);
    Navbar.render('home', me);
    AppShell.render(host, page(catalog));
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  } catch (err) { Toast.error(err.message || 'Fehler beim Laden'); }
})();
