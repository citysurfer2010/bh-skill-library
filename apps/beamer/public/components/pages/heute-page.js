'use strict';
/** Heute: reiner Anzeige-Screen wie das Startbild des Beamers, ohne Navigation. Daten aus der Beamer-App. */
(async () => {
  const BASE = window.APP_BASE; const host = document.getElementById('page-host'); const esc = AppShell.esc;
  const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const deg = (v) => (v === null || v === undefined ? '–' : `${String(v).replace('.', ',')}°`);
  const clock = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function dayLabel(date) {
    const n = new Date(); const t = iso(n); n.setDate(n.getDate() + 1);
    return date === t ? 'Heute' : date === iso(n) ? 'Morgen' : `${DAYS[new Date(`${date}T12:00:00`).getDay()].slice(0, 2)} ${Number(date.slice(8))}.`;
  }
  const merged = (list) => list.reduce((out, l) => { const p = out[out.length - 1]; if (!p || p.subject !== l.subject || p.state !== l.state || p.exam !== l.exam) out.push(l); return out; }, []);
  const SKY = (c) => (c === 0 ? 'Klar' : c <= 2 ? 'Leicht bewölkt' : c === 3 ? 'Bedeckt' : c <= 48 ? 'Nebel' : c <= 67 || (c >= 80 && c <= 82) ? 'Regen' : c <= 77 || c === 85 || c === 86 ? 'Schnee' : 'Gewitter');
  const CLOUD_PATH = 'M30 80h60a20 20 0 0 0 4-39 29 29 0 0 0-55-7 23 23 0 0 0-9 46z';
  const SPOTS = [[620, 6, 330, .3, 24], [300, 44, 430, .38, 34], [860, 120, 270, .2, 19], [90, 8, 340, .28, 40], [500, 150, 380, .32, 28], [900, -24, 330, .24, 22]];
  const CAKE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM4 16c2 2 4 2 6 0s4-2 6 0 4 2 4 0M12 11V7M12 3v.5"/></svg>';
  const WARN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 21h20zM12 10v5M12 18h.01"/></svg>';

  document.body.classList.add('hx-body');
  AppShell.loading(host, 'Heute', 'cards');
  // Tag von Sonnenaufgang bis Sonnenuntergang, Abend bis 21 Uhr; ohne Wetterdaten feste Stunden.
  const phase = () => {
    const now = new Date(); const h = now.getHours();
    if (wx?.rise && wx?.set && wx.set.slice(0, 10) === iso(now)) { if (now >= new Date(wx.rise) && now < new Date(wx.set)) return 'day'; return now >= new Date(wx.set) && h < 21 ? 'evening' : 'night'; }
    return h >= 5 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
  };
  let pickTimer = null;
  let data = null; let stale = false; let dayIndex = 0; let picked = false; let wx = null; let at = null; let scene = null; let wxSig = '';

  function weatherBox() {
    if (!wx) return '';
    return `<div class="hx-wx"><div class="hx-temp-big">${deg(Math.round(wx.t))}</div><p>${esc(SKY(wx.c))} · Berlin</p><p>Heute bis ${deg(Math.round(wx.max))} · Regen ${wx.rain} %</p></div>`;
  }
  // Wetter als bewegter Hintergrund, wie auf dem Beamer. Bleibt beim Aktualisieren der Daten stehen.
  const fall = (cls, count, dur) => Array.from({ length: count }, (_, i) => `<i class="${cls}" style="left:${((120 + (i * 137) % 960) / 11.8).toFixed(1)}%;top:${(i * 53) % 120 - 20}px;animation-delay:${((i * 0.17) % dur).toFixed(2)}s"></i>`).join('');
  const cloud = (s, fill) => `<svg class="wc" viewBox="0 0 120 90" style="left:${(s[0] / 11.8).toFixed(1)}%;top:calc(var(--u) * ${s[1]});width:min(calc(var(--u) * ${s[2]}), 62%);opacity:${s[3]};animation-duration:${s[4]}s" aria-hidden="true"><path fill="${fill}" d="${CLOUD_PATH}"/></svg>`;
  function weatherScene() {
    if (!wx || !scene) return;
    const time = phase(); const sig = `${wx.c}|${time}`; if (sig === wxSig) return; wxSig = sig;
    const c = wx.c; const rain = (c >= 51 && c <= 67) || (c >= 80 && c <= 82); const snow = (c >= 71 && c <= 77) || c === 85 || c === 86; const storm = c >= 95; const fog = c > 3 && c <= 48;
    const count = c <= 1 ? 1 : c === 2 ? 3 : 6; const fill = time === 'night' ? 'var(--hx-cloud-night)' : rain || storm ? 'var(--hx-cloud-rain)' : 'var(--hx-cloud-day)';
    let html = c <= 2 ? (time === 'day' ? '<div class="wsun"><svg class="wrays" viewBox="0 0 240 240" aria-hidden="true"><g stroke="currentColor" stroke-width="10" stroke-linecap="round"><path d="M120 8v28M120 204v28M8 120h28M204 120h28M41 41l20 20M179 179l20 20M41 199l20-20M179 61l20-20"/></g></svg><span></span></div>' : '<div class="wmoon"></div>') : '';
    html += SPOTS.slice(0, count).map((s) => cloud(s, fill)).join('');
    if (fog) html += '<u class="wfog"></u><u class="wfog f2"></u><u class="wfog f3"></u>';
    if (rain || storm) html += fall('wr', 34, 1);
    if (snow) html += fall('ws', 30, 4);
    if (storm) html += '<b class="wflash"></b>';
    scene.querySelector('.hx-wxbg').innerHTML = html;
  }
  function pill() {
    const list = data.birthdays || []; if (!list.length) return '';
    const b = list[0];
    return `<div class="hx-pill ${b.inDays === 0 ? 'party' : ''}">${CAKE}<small>${b.inDays === 0 ? 'Heute wird' : b.inDays === 1 ? 'Morgen wird' : `In ${b.inDays} Tagen wird`}</small>${esc(b.name)} ${Number(b.age)}</div>`;
  }
  function school() {
    const today = iso(new Date()); const days = (data.schedule?.days || []).filter((d) => d.date >= today);
    if (!days.length) return `<section class="hx-panel"><p class="hx-empty">${data.schedule ? 'Keine Schultage in Sicht.' : 'Stundenplan gerade nicht abrufbar.'}</p></section>`;
    // Nach der letzten Stunde interessiert der nächste Tag, solange niemand selbst gewählt hat.
    if (!picked) { const ends = days[0].kids.flatMap((k) => k.lessons.filter((l) => l.state !== 'cancelled').map((l) => l.to)).sort().pop(); dayIndex = days[0].date === today && days.length > 1 && (!ends || clock() > ends) ? 1 : 0; }
    dayIndex = Math.min(dayIndex, days.length - 1);
    const tabs = `<div class="hx-days">${days.map((d, i) => `<button class="hx-day" aria-pressed="${i === dayIndex}" data-day="${i}">${esc(dayLabel(d.date))}</button>`).join('')}</div>`;
    const kids = days[dayIndex].kids.map((k) => {
      if (!k.lessons.length) return `<div class="hx-kid"><h3>${esc(k.name)}<small>Frei</small></h3></div>`;
      const live = k.lessons.filter((l) => l.state !== 'cancelled'); const time = live.length ? `${live[0].from} – ${live[live.length - 1].to}` : 'alles fällt aus';
      const hw = k.homework?.length ? `<ul class="hx-hw">${k.homework.map((h) => `<li><b>${esc(h.subject)}</b> ${esc(h.text)}</li>`).join('')}</ul>` : '';
      return `<div class="hx-kid"><h3>${esc(k.name)}<small>${esc(time)}</small></h3><div class="hx-chips">${merged(k.lessons).map((l) => `<span class="hx-chip ${l.state === 'regular' ? (l.exam ? 'exam' : '') : esc(l.state)}">${l.state === 'cancelled' ? `<span class="hx-gone">${esc(l.subject)}</span> fällt aus` : `${l.state === 'changed' ? `${esc(l.from)} ` : ''}${esc(l.subject)}${l.exam ? ' Klausur' : l.state === 'changed' ? ' geändert' : ''}`}</span>`).join('')}</div>${hw}</div>`;
    }).join('');
    return `<section class="hx-panel">${tabs}<div class="hx-kids">${kids || '<p class="hx-empty">Schulfrei.</p>'}</div></section>`;
  }
  function events() {
    const now = Date.now(); const list = (data.events || []).filter((e) => !e.endAt || e.endAt > now);
    if (!data.eventsLoaded) return '<section class="hx-strip"><p class="hx-empty">Termine gerade nicht abrufbar.</p></section>';
    if (!list.length) return '';
    const today = iso(new Date());
    return `<section class="hx-strip" aria-label="Termine">${list.slice(0, 3).map((e) => { const running = e.startAt && e.startAt <= now; return `<div class="hx-ev"><b class="${running ? 'now' : e.date === today ? 'today' : ''}">${running ? 'Jetzt' : `${esc(dayLabel(e.date))}${e.time ? ` ${esc(e.time)}` : ''}`}</b><span class="hx-grow">${esc(e.title)}</span></div>`; }).join('')}</section>`;
  }
  const alerts = () => { const l = data.alerts || []; return l.length ? `<div class="hx-alerts">${l.map((a) => `<div class="hx-alert" role="status">${WARN}<b>${esc(a.text || a.summary || a.label)}</b><small>${esc(a.text || a.summary ? a.label : '')}</small></div>`).join('')}</div>` : ''; };
  function transit() {
    const b = data.board; const up = b?.departures ? b.departures.filter((d) => new Date(d.when) >= Date.now() - 60000) : [];
    if (!up.length) return `<section class="hx-strip"><p class="hx-empty">${b ? 'Gerade keine Abfahrten bekannt.' : 'Abfahrten gerade nicht abrufbar.'}</p></section>`;
    // Auf dem großen Bild ist Platz für zwei: ein Ausfall zuerst, dann je Richtung die nächste Fahrt.
    const shown = new Set(up.filter((d) => d.cancelled).slice(0, 1));
    for (const way of [...new Set(up.map((d) => d.towards))]) { if (shown.size < 2) { const next = up.find((d) => d.towards === way && !shown.has(d)); if (next && ![...shown].some((d) => d.towards === way)) shown.add(next); } }
    for (const d of up) if (shown.size < 2) shown.add(d);
    return `<section class="hx-strip" aria-label="Abfahrten"><span class="hx-stop">${esc(b.stop)}</span>${up.map((d) => { const m = Math.max(0, Math.round((new Date(d.when) - Date.now()) / 60000)); return `<div class="hx-dep ${shown.has(d) ? '' : 'hx-more'}"><span class="hx-line ${d.cancelled ? 'hx-gone' : ''}">${esc(d.line)}</span>${d.towards ? `<span class="hx-way">${d.towards === 'Westen' ? '← Westen' : 'Zoo →'}</span>` : ''}<span class="hx-grow ${d.cancelled ? 'hx-gone' : ''}">${esc(d.direction || '')}</span><span class="hx-min ${d.cancelled ? 'off' : d.delayMinutes >= 3 ? 'late' : ''}">${d.cancelled ? `${new Date(d.when).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} fällt aus` : `${m === 0 ? 'jetzt' : `${m} Min`}${d.delayMinutes >= 3 ? ` (+${d.delayMinutes})` : ''}`}</span></div>`; }).join('')}</section>`;
  }
  function rooms() {
    const list = data.rooms || []; const plan = data.heating?.mode || (data.heating?.plan ? `Plan: ${data.heating.plan}` : '');
    if (!list.length) return '<section class="hx-strip"><p class="hx-empty">Raumwerte gerade nicht abrufbar.</p></section>';
    const sorted = [...list].sort((a, b) => (b.name === 'Wohnzimmer') - (a.name === 'Wohnzimmer'));
    return `<section class="hx-strip" aria-label="Räume">${plan ? `<span class="hx-stop">${esc(plan)}</span>` : ''}${sorted.map((r) => { const note = !r.reachable ? ['Nicht erreichbar', 'alarm'] : r.windowOpen ? ['Fenster offen', 'alarm'] : r.batteryLow ? ['Batterie schwach', 'alarm'] : r.heating ? [`Heizt auf ${deg(r.target)}`, 'heat'] : [`Soll ${deg(r.target)}`, '']; return `<div class="hx-room"><span class="hx-grow">${esc(r.name)}</span><b>${deg(r.temp)}</b><small class="hx-note ${note[1]}">${esc(note[0])}</small></div>`; }).join('')}</section>`;
  }
  const HILLS = '<svg class="hx-hills" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="M0 500 C 380 440 820 560 1220 490 S 1720 440 1920 490 V1080 H0Z"/><path class="b" d="M0 720 C 500 680 930 750 1410 705 S 1790 690 1920 715 V1080 H0Z"/></svg>';
  function ensureScene() {
    if (scene) return;
    const stars = Array.from({ length: 70 }, (_, n) => [(n * 277) % 1900, (n * 89) % 500, n]).filter(([x, y]) => !(x <= 540 && y <= 310) && !(x >= 1420 && y >= 150 && y <= 260)).map(([x, y, n]) => `<i style="left:${(x / 19).toFixed(1)}%;top:${y}px;animation-delay:${((n * 0.31) % 4).toFixed(2)}s"></i>`).join('');
    host.innerHTML = `<div class="hx-scene">${HILLS}<div class="hx-stars" aria-hidden="true">${stars}</div><div class="hx-wxbg" aria-hidden="true"></div><div class="hx-inner"></div></div>`;
    scene = host.firstChild;
  }
  // Ein Anzeige-Screen wird nicht gescrollt: Bei viel Inhalt rückt alles etwas kleiner zusammen.
  function fit() {
    if (innerWidth < 961) { scene.style.removeProperty('--fit'); return; }
    let f = 1; scene.style.setProperty('--fit', f);
    while (f > 0.66 && scene.scrollHeight > innerHeight) { f -= 0.03; scene.style.setProperty('--fit', f.toFixed(2)); }
  }
  addEventListener('resize', () => { if (scene) fit(); });
  function render() {
    if (!data) { host.innerHTML = '<div class="hx-scene"><div class="hx-inner"><section class="hx-panel" role="alert"><p class="hx-empty">Heute konnte nicht geladen werden. Bitte prüfe die Verbindung.</p><button class="hx-day" onclick="location.reload()">Nochmal versuchen</button></section></div></div>'; return; }
    ensureScene(); scene.setAttribute('data-time', phase()); weatherScene();
    const d = new Date(); const y = window.scrollY; const focusDay = document.activeElement?.dataset?.day;
    scene.querySelector('.hx-inner').innerHTML = `<header class="hx-top"><div><div class="hx-clock">${clock()}</div><div class="hx-date">${DAYS[d.getDay()]}, ${d.getDate()}. ${d.toLocaleString('de-DE', { month: 'long' })}</div></div>${pill()}${weatherBox()}</header>${stale ? `<p class="hx-stale" role="status">Keine Verbindung. Stand ${esc(at || '')}.</p>` : ''}${school()}${events()}${alerts()}${transit()}${rooms()}`;
    fit(); window.scrollTo(0, y); if (focusDay) scene.querySelector(`[data-day="${focusDay}"]`)?.focus();
  }
  async function load(fresh) {
    try {
      const r = await fetch(`${BASE}/api/today${fresh ? '?fresh=1' : ''}`);
      if (r.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
      if (!r.ok) throw new Error('fehlgeschlagen');
      data = await r.json(); stale = false; at = clock();
    } catch (e) { stale = true; }
    render();
  }
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) { dayIndex = Number(b.dataset.day); picked = true; clearTimeout(pickTimer); pickTimer = setTimeout(() => { picked = false; render(); }, 120_000); render(); } });
  async function weather() {
    try { const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,weather_code&daily=temperature_2m_max,precipitation_probability_max,sunrise,sunset&timezone=Europe%2FBerlin&forecast_days=1'); const j = await r.json(); wx = { t: j.current.temperature_2m, c: j.current.weather_code, max: j.daily.temperature_2m_max[0], rain: j.daily.precipitation_probability_max[0], rise: j.daily.sunrise?.[0], set: j.daily.sunset?.[0] }; if (data) render(); } catch (e) { /* ohne Wetter weiter */ }
  }
  await load(true); weather(); setInterval(weather, 1_800_000);
  setInterval(() => { if (!document.hidden) load(false); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
  setInterval(() => { if (!document.hidden && data) { const c = host.querySelector('.hx-clock'); if (c) c.textContent = clock(); } }, 5000);
  setInterval(() => { if (!document.hidden && data) render(); }, 30_000);
})();
