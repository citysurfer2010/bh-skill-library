'use strict';
/** Bedienseite des Beamers. Zustand oben, Inhalte links, Fernbedienung rechts; Reihenfolge am Handy in beamer.css. */
(async () => {
  const esc = AppShell.esc;
  const host = document.getElementById('page-host');
  const STATE = { on: ['An', 'on'], standby: ['Aus', 'off'], 'nicht erreichbar': ['Aus oder nicht erreichbar', 'off'] };
  const arrow = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const PAD = [[], ['KEY_UP', arrow('M6 15l6-6 6 6'), 'Hoch'], [], ['KEY_LEFT', arrow('M15 6l-6 6 6 6'), 'Links'], ['KEY_ENTER', 'OK', 'Bestätigen'], ['KEY_RIGHT', arrow('M9 6l6 6-6 6'), 'Rechts'], ['KEY_RETURN', 'Zurück', 'Zurück'], ['KEY_DOWN', arrow('M6 9l6 6 6-6'), 'Runter'], ['KEY_HOME', 'Home', 'Startseite']];
  const EXTRA = [['KEY_VOLDOWN', 'Leiser'], ['KEY_MUTE', 'Stumm'], ['KEY_VOLUP', 'Lauter'], ['KEY_PLAY', 'Play'], ['KEY_PAUSE', 'Pause']];
  let now = null; let zustand = null; let statusFailed = false;

  const section = (title, body, extra = '', id = '') => `<section class="bm-section" ${id ? `id="${id}"` : ''}><div class="bm-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
  const data = (o) => esc(JSON.stringify(o));
  const moodTile = (m) => `<button class="bm-mood" data-send="/mood" data-body="${data({ id: m.id })}" data-now="mood:${esc(m.id)}"><img src="${esc(m.thumb)}" alt="" loading="lazy"><span>${esc(m.label)}</span></button>`;
  const stationTile = (s) => `<button class="bm-station" data-send="/radio" data-body="${data({ id: s.id })}" data-now="radio:${esc(s.id)}">${esc(s.label)}</button>`;
  const form = (id, label, name, placeholder, cta, type = 'text') => `<form class="bm-form" data-form="${id}"><label class="bh-label" for="f-${id}">${label}</label><div class="bm-row"><input id="f-${id}" class="bh-input" name="${name}" type="${type}" placeholder="${placeholder}" required autocomplete="off"><button class="bh-btn">${cta}</button></div></form>`;
  const shareButtons = () => (BeamerShare.canScreen() ? '<button class="bh-btn bh-btn-primary" data-share="screen">Bildschirm teilen</button>' : '') + '<button class="bh-btn" data-share="camera">Kamera zeigen</button><button class="bh-btn" data-share="stop" hidden>Beenden</button>';

  function page(c) {
    return `<header class="app-topbar"><div><h1>Beamer</h1><div class="sub bm-status" aria-live="polite"><span class="bm-state" id="bm-state">Wird geprüft</span><span id="bm-now"></span><button class="bh-btn bh-btn-sm" data-stop hidden>Stoppen</button></div></div>
      <div class="app-topbar-actions"><button class="bh-btn bh-btn-primary" data-power="on" hidden>Einschalten</button><button class="bh-btn bh-btn-danger" data-power="off" hidden>Ausschalten</button></div></header>
      <div class="bm-notice" id="bm-notice" role="status" hidden>Der Beamer ist aus. Schalte ihn ein, bevor du etwas startest.</div>
      <div class="bm-layout"><div class="bm-main">
        ${section('Stimmung', `<div class="bm-moods">${c.moods.map(moodTile).join('')}</div>`)}
        ${section('Radio', `<div class="bm-stations">${c.stations.map(stationTile).join('')}</div>`, '<button class="bh-btn bh-btn-sm" data-send="/radio/stop" data-body="{}" data-radio-stop hidden>Radio aus</button>')}
        ${section('Vom Laptop zeigen', `<div class="bm-share">${shareButtons()}</div><p class="bm-hint" id="bm-share-state" aria-live="polite">${BeamerShare.canScreen() ? 'Der Laptop muss im Heimnetz sein.' : 'Bildschirm teilen geht nur am Laptop.'}</p>`)}
        ${section('Eigene Inhalte', `<div class="bm-forms">${form('youtube', 'YouTube-Link', 'video', 'https://www.youtube.com/watch?v=…', 'Abspielen')}${form('text', 'Text anzeigen', 'title', 'Hallo zusammen', 'Anzeigen')}${form('url', 'Webseite öffnen', 'url', 'https://…', 'Öffnen', 'url')}</div>`)}
      </div><aside class="bm-side">
        ${section('Fernbedienung', `<div class="bm-pad">${PAD.map(([k, l, a]) => (k ? `<button class="bm-key" data-key="${k}" aria-label="${a}">${l}</button>` : '<span></span>')).join('')}</div><div class="bm-extra">${EXTRA.map(([k, l]) => `<button class="bh-btn" data-key="${k}">${l}</button>`).join('')}</div>`)}
        ${section('Apps', `<div class="bm-apps">${c.apps.map((a) => `<button class="bh-btn" data-send="/app" data-body="${data({ app: a })}">${esc(a)}</button>`).join('')}</div>`)}
      </aside></div>`;
  }

  const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  function paint() {
    const stateEl = document.getElementById('bm-state');
    if (!stateEl) return;
    const [label, tone] = statusFailed ? ['Status nicht abrufbar', 'off'] : STATE[zustand] || [zustand || 'Wird geprüft', ''];
    setText(stateEl, label); stateEl.dataset.tone = tone;
    const on = zustand === 'on';
    setText(document.getElementById('bm-now'), on && now ? `Läuft: ${now.label}` : '');
    document.getElementById('bm-notice').hidden = !zustand || on || statusFailed;
    host.querySelector('[data-stop]').hidden = !on || !now || now.kind === 'share';
    host.querySelector('[data-radio-stop]').hidden = now?.kind !== 'radio';
    host.querySelector('[data-power="on"]').hidden = !zustand || on;
    host.querySelector('[data-power="off"]').hidden = !on;
    host.querySelectorAll('[data-now]').forEach((b) => {
      const active = on && !!now && b.dataset.now === `${now.kind}:${now.id}`;
      b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', String(active));
    });
  }

  async function refresh() {
    try { ({ zustand, now } = await BeamerApi.status()); statusFailed = false; } catch { statusFailed = true; }
    paint();
  }

  async function busy(el, work) {
    el.setAttribute('aria-busy', 'true'); el.disabled = true;
    try { return await work(); } catch (e) { Toast.error(e.message || 'Hat nicht geklappt'); return null; } finally { el.removeAttribute('aria-busy'); el.disabled = false; paint(); }
  }
  async function send(el, path, body, ok) {
    const r = await busy(el, () => BeamerApi.send(path, body));
    if (!r) return false;
    if ('now' in r) now = r.now;
    paint();
    if (ok) Toast.success(ok);
    return true;
  }

  const SHARE_TEXT = { connecting: 'Verbinde mit dem Beamer …', live: 'Wird auf dem Beamer gezeigt.', ended: 'Freigabe beendet.', failed: 'Keine Verbindung zum Beamer. Ist der Laptop im Heimnetz?' };
  function shareState(s) {
    setText(document.getElementById('bm-share-state'), SHARE_TEXT[s]);
    host.querySelector('[data-share="stop"]').hidden = s === 'ended' || s === 'failed';
    if (s === 'ended' || s === 'failed') { now = null; paint(); }
  }
  async function share(b) {
    if (b.dataset.share === 'stop') { await busy(b, () => BeamerShare.stop()); shareState('ended'); return; }
    try { await BeamerShare.start(b.dataset.share, shareState); await refresh(); }
    catch (e) { shareState('ended'); if (e.name !== 'NotAllowedError') Toast.error(e.message || 'Freigabe nicht möglich'); }
  }

  host.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.share) return share(b);
    // Tasten ohne Sperre: Schnelle Pfeilfolgen dürfen nicht verloren gehen.
    if (b.dataset.key) return BeamerApi.send('/key', { key: b.dataset.key }).catch((err) => Toast.error(err.message));
    if ('stop' in b.dataset) return send(b, '/stop', {}, 'Gestoppt');
    if (b.dataset.power) { const on = b.dataset.power === 'on'; if (on) setText(document.getElementById('bm-state'), 'Wird eingeschaltet …'); await send(b, '/power', { state: b.dataset.power }, on ? 'Beamer ist an' : 'Beamer ist aus'); refresh(); return; }
    if (b.dataset.send) return send(b, b.dataset.send, JSON.parse(b.dataset.body), b.textContent.trim().slice(0, 40));
  });
  host.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const input = f.querySelector('input');
    if (await send(f.querySelector('button'), `/${f.dataset.form}`, { [input.name]: input.value }, 'Wird auf dem Beamer gezeigt')) input.value = '';
  });

  try {
    Navbar.render('home', null);
    AppShell.crumbs([['Apps', '/'], ['Beamer']]);
    AppShell.loading(host, 'Beamer', 'cards');
    const [me, catalog] = await Promise.all([BeamerApi.me(), BeamerApi.catalog()]);
    Navbar.render('home', me);
    AppShell.render(host, page(catalog));
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  } catch (err) { Toast.error(err.message || 'Fehler beim Laden'); }
})();
