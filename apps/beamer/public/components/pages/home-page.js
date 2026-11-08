'use strict';
/** Logik der Bedienseite; Markup in beamer-view.js, Gestaltung in css/beamer.css. */
(async () => {
  const host = document.getElementById('page-host');
  const REPEAT = new Set(['KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_VOLUP', 'KEY_VOLDOWN']);
  const SHARE_TEXT = { connecting: 'Verbinde mit dem Beamer …', live: 'Wird auf dem Beamer gezeigt.', ended: 'Freigabe beendet.', failed: 'Keine Verbindung zum Beamer. Ist das Gerät im Heimnetz?' };
  let catalog; let now = null; let zustand = null; let statusFailed = false; let poweringOn = false; let shareLive = false;
  let pending = null; let scrolledPast = false; let confirmOff = false; let confirmTimer = null; let paused = false;
  const $ = (id) => document.getElementById(id);
  const all = (sel) => host.querySelectorAll(sel);
  const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const setHidden = (sel, hidden) => all(sel).forEach((b) => { b.hidden = hidden; });

  function model() {
    if (poweringOn) return { state: ['Startet', ''], title: 'Wird eingeschaltet …', sub: 'Das dauert einen Moment.' };
    if (statusFailed) return { state: ['Unbekannt', 'off'], title: 'Status nicht abrufbar', sub: 'Die Verbindung zum Beamer ist gestört.' };
    if (zustand === 'nicht erreichbar') return { state: ['Unbekannt', 'off'], title: 'Beamer aus oder nicht erreichbar', sub: 'Tippe eine Stimmung, einen Sender oder eine App an, um ihn einzuschalten.' };
    if (zustand && zustand !== 'on') return { state: ['Aus', 'off'], title: 'Der Beamer ist aus', sub: 'Tippe eine Stimmung, einen Sender oder eine App an, er schaltet sich dann ein.' };
    if (pending) return { state: ['An', 'on'], title: `Startet: ${pending}`, sub: 'Einen Moment …' };
    if (now) return { state: ['Läuft', 'live'], title: now.label, sub: '' };
    return { state: [zustand ? 'An' : 'Wird geprüft', zustand ? 'on' : ''], title: 'Bereit', sub: 'Such dir etwas aus.' };
  }

  function paint() {
    if (!$('bm-hero')) return;
    const m = model(); const on = zustand === 'on';
    setText($('bm-state'), m.state[0]); $('bm-state').dataset.tone = m.state[1];
    setText($('bm-title'), m.title); setText($('bm-sub'), m.sub);
    const mood = on && now?.kind === 'mood' && catalog.moods.find((x) => x.id === now.id);
    const img = $('bm-hero-img');
    if (mood && img.getAttribute('src') !== mood.hero) img.src = mood.hero;
    img.hidden = !mood; $('bm-hero').classList.toggle('has-image', !!mood);
    const canStop = on && !!now && !pending;
    setHidden('[data-stop]', !canStop || confirmOff);
    $('bm-layout').toggleAttribute('data-off', !on);
    setHidden('[data-power="on"]', !zustand || on || poweringOn);
    setHidden('[data-power="off"]', !on || confirmOff);
    setHidden('[data-power-confirm], [data-power-cancel]', !on || !confirmOff);
    $('bm-nowbar').hidden = !(scrolledPast && on && (now || pending));
    setText($('bm-nowbar-text'), pending ? `Startet: ${pending}` : now ? `Läuft: ${now.label}` : '');
    all('[data-now]').forEach((b) => {
      const active = on && !!now && b.dataset.now === `${now.kind}:${now.id}`;
      b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', String(active));
    });
  }

  async function refresh() {
    try { ({ zustand, now } = await BeamerApi.status()); statusFailed = false; } catch { statusFailed = true; }
    paint();
  }

  async function powerOn() {
    poweringOn = true; paint();
    try { await BeamerApi.send('/power', { state: 'on' }); await refresh(); return zustand === 'on'; }
    catch (e) { Toast.error(e.message); await refresh(); return false; }
    finally { poweringOn = false; paint(); }
  }

  async function start(b, path, body, label, ok) {
    if (pending) return;
    pending = label; b.classList.add('is-pending'); b.setAttribute('aria-disabled', 'true'); paint();
    try {
      if (zustand !== 'on' && !(await powerOn())) return;
      const r = await BeamerApi.send(path, body);
      if ('now' in r) now = r.now;
      paused = false;
      Toast.success(ok || `${label} läuft`);
      return true;
    } catch (e) { Toast.error(e.message || 'Hat nicht geklappt'); return false; }
    finally { pending = null; b.classList.remove('is-pending'); b.removeAttribute('aria-disabled'); paint(); }
  }

  function shareState(s) {
    setText($('bm-share-state'), SHARE_TEXT[s]);
    shareLive = s !== 'ended' && s !== 'failed';
    if (!shareLive) refresh();
  }
  async function share(b) {
    if (zustand !== 'on' && !(await powerOn())) return;
    try { await BeamerShare.start(b.dataset.share, shareState); await refresh(); }
    catch (e) { shareState('ended'); if (e.name !== 'NotAllowedError') Toast.error(e.message || 'Freigabe nicht möglich'); }
  }
  async function stop() {
    try {
      if (shareLive) { await BeamerShare.stop(); shareState('ended'); } else { const r = await BeamerApi.send('/stop'); now = r.now; }
      Toast.success('Gestoppt');
    } catch (e) { Toast.error(e.message); }
    paint();
  }

  function setConfirm(v) { confirmOff = v; clearTimeout(confirmTimer); if (v) confirmTimer = setTimeout(() => setConfirm(false), 5000); paint(); }
  async function powerOff() {
    setConfirm(false);
    try { await BeamerApi.send('/power', { state: 'off' }); Toast.success('Beamer ist aus'); } catch (e) { Toast.error(e.message); }
    refresh();
  }

  // Taste: sofort senden, nie mehrere gleichzeitig; das Gateway braucht je Druck einige Hundert Millisekunden.
  const queue = []; let draining = false; let lastError = 0; let holdTimer = null; let repeatTimer = null;
  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length) {
      try { const r = await BeamerApi.send('/key', { key: queue.shift() }); if (r.now !== undefined && r.now?.label !== now?.label) { now = r.now; paint(); } }
      catch (e) { queue.length = 0; if (Date.now() - lastError > 5000) { lastError = Date.now(); Toast.error(e.message); } }
    }
    draining = false;
  }
  function press(key, repeat = false) {
    if (zustand !== 'on') { if (!repeat) Toast.error('Der Beamer ist aus.'); return; }
    if (repeat ? (queue.length || draining) : queue.length >= 6) return;
    let k = key;
    if (key === 'TOGGLE') { k = paused ? 'KEY_PLAY' : 'KEY_PAUSE'; paused = !paused; }
    queue.push(k); drain();
  }
  const release = () => { clearTimeout(holdTimer); clearInterval(repeatTimer); };
  document.addEventListener('touchstart', () => {}, { passive: true });
  host.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b || e.button !== 0) return;
    if (navigator.vibrate) navigator.vibrate(10);
    press(b.dataset.key);
    if (REPEAT.has(b.dataset.key)) holdTimer = setTimeout(() => { repeatTimer = setInterval(() => press(b.dataset.key, true), 400); }, 350);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => host.addEventListener(t, release, true));

  host.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('gotoRemote' in b.dataset) { host.querySelector('[role="tab"][data-view="remote"]').click(); $('bm-hero').scrollIntoView(); return; }
    if (b.dataset.key) { if (e.detail === 0) press(b.dataset.key); return; } // Tastatur; Maus und Finger laufen über pointerdown
    if (b.dataset.view) {
      $('bm-layout').dataset.view = b.dataset.view;
      all('[data-view][role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
      try { localStorage.setItem('beamer-view', b.dataset.view); } catch { /* egal */ }
      return;
    }
    if (b.dataset.share) { share(b); return; }
    if ('stop' in b.dataset) { stop(); return; }
    if (b.dataset.power === 'on') { powerOn(); return; }
    if (b.dataset.power === 'off') { setConfirm(true); return; }
    if ('powerConfirm' in b.dataset) { powerOff(); return; }
    if ('powerCancel' in b.dataset) { setConfirm(false); return; }
    if (b.dataset.send) start(b, b.dataset.send, JSON.parse(b.dataset.body), b.dataset.label);
  });
  host.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const input = f.querySelector('input');
    if (await start(f.querySelector('button'), `/${f.dataset.form}`, { [input.name]: input.value }, 'Eigener Inhalt', 'Wird auf dem Beamer gezeigt')) input.value = '';
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  try {
    Navbar.render('home', null);
    AppShell.crumbs([['Apps', '/'], ['Beamer']]);
    AppShell.loading(host, 'Beamer', 'cards');
    let me; [me, catalog] = await Promise.all([BeamerApi.me(), BeamerApi.catalog()]);
    Navbar.render('home', me);
    AppShell.render(host, BeamerView.page(catalog));
    if (window.matchMedia('(min-width: 961px)').matches) $('bm-more').open = true;
    let view = 'start'; try { view = localStorage.getItem('beamer-view') || 'start'; } catch { /* egal */ }
    host.querySelector(`[role="tab"][data-view="${view === 'remote' ? 'remote' : 'start'}"]`).click();
    new IntersectionObserver(([en]) => { scrolledPast = !en.isIntersecting; paint(); }).observe($('bm-hero'));
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  } catch (err) { Toast.error(err.message || 'Fehler beim Laden'); }
})();
