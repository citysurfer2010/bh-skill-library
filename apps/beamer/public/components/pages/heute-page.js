'use strict';
/** Heute: das Wichtigste für die Familie, nach Dringlichkeit sortiert. Daten aus der Beamer-App. */
(async () => {
  const BASE = window.APP_BASE; const host = document.getElementById('page-host'); const esc = AppShell.esc;
  const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const deg = (v) => (v === null || v === undefined ? '–' : `${String(v).replace('.', ',')}°`);
  function dayLabel(date) {
    const n = new Date(); const t = iso(n); n.setDate(n.getDate() + 1);
    return date === t ? 'Heute' : date === iso(n) ? 'Morgen' : `${DAYS[new Date(`${date}T12:00:00`).getDay()]} ${Number(date.slice(8))}.`;
  }
  const merged = (list) => list.reduce((out, l) => { const p = out[out.length - 1]; if (!p || p.subject !== l.subject || p.state !== l.state || p.exam !== l.exam) out.push(l); return out; }, []);

  AppShell.crumbs([['Beamer', `${BASE}/`], ['Heute']]);
  AppShell.loading(host, 'Heute', 'cards');
  let data = null; let stale = false; let dayIndex = 0; let picked = false; let wx = null; let at = null; const pending = {}; const seqs = {};
  const SKY = (c) => (c === 0 ? 'Klar' : c <= 2 ? 'Leicht bewölkt' : c === 3 ? 'Bedeckt' : c <= 48 ? 'Nebel' : c <= 67 || (c >= 80 && c <= 82) ? 'Regen' : c <= 77 || c === 85 || c === 86 ? 'Schnee' : 'Gewitter');
  const card = (title, body, sub = '') => `<section class="hx-card"><h2>${title}${sub ? `<small>${sub}</small>` : ''}</h2>${body}</section>`;

  function transit() {
    const b = data.board; const up = b?.departures ? b.departures.filter((d) => new Date(d.when) >= Date.now() - 60000) : [];
    if (!up.length) return card('Abfahrten', `<p class="hx-empty">${b ? 'Gerade keine Abfahrten bekannt.' : 'Abfahrten gerade nicht abrufbar.'}</p>`);
    return card('Abfahrten', `<ul class="hx-list">${up.map((d) => { const m = Math.max(0, Math.round((new Date(d.when) - Date.now()) / 60000)); return `<li><span class="hx-line ${d.cancelled ? 'hx-gone' : ''}">${esc(d.line)}</span><span class="hx-grow ${d.cancelled ? 'hx-gone' : ''}">${esc(d.direction || '')}${d.towards ? `<br><small>${d.towards === 'Westen' ? 'Richtung Westen' : 'Richtung Zoo'}</small>` : ''}</span><span class="hx-min ${d.cancelled ? 'off' : d.delayMinutes >= 3 ? 'late' : ''}">${d.cancelled ? `${new Date(d.when).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} fällt aus` : `${m === 0 ? 'jetzt' : `${m} Min`}${d.delayMinutes >= 3 ? ` (+${d.delayMinutes})` : ''}`}</span></li>`; }).join('')}</ul>`, esc(b.stop));
  }
  function school() {
    const today = iso(new Date()); const days = (data.schedule?.days || []).filter((d) => d.date >= today);
    if (!days.length) return card('Schule', `<p class="hx-empty">${data.schedule ? 'Keine Schultage in Sicht.' : 'Stundenplan gerade nicht abrufbar.'}</p>`);
    // Nach der letzten Stunde interessiert der nächste Tag, solange niemand selbst gewählt hat.
    if (!picked) { const ends = days[0].kids.flatMap((k) => k.lessons.filter((l) => l.state !== 'cancelled').map((l) => l.to)).sort().pop(); const clock = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`; dayIndex = days[0].date === today && days.length > 1 && (!ends || clock > ends) ? 1 : 0; }
    dayIndex = Math.min(dayIndex, days.length - 1);
    const kids = days[dayIndex].kids;
    const tabs = `<div class="hx-days">${days.map((d, i) => `<button class="hx-day" aria-pressed="${i === dayIndex}" data-day="${i}">${esc(dayLabel(d.date))}</button>`).join('')}</div>`;
    return card('Schule', tabs + (kids.length ? kids.map((k) => {
      if (!k.lessons.length) return `<div class="hx-kid"><h3>${esc(k.name)}<small>Frei</small></h3></div>`;
      const live = k.lessons.filter((l) => l.state !== 'cancelled'); const time = live.length ? `${live[0].from} – ${live[live.length - 1].to}` : 'alles fällt aus';
      const hw = k.homework?.length ? `<ul class="hx-hw">${k.homework.map((h) => `<li><b>${esc(h.subject)}</b> ${esc(h.text)}</li>`).join('')}</ul>` : '';
      return `<div class="hx-kid"><h3>${esc(k.name)}<small>${esc(time)}</small></h3><div class="hx-chips">${merged(k.lessons).map((l) => `<span class="hx-chip ${l.state === 'regular' ? (l.exam ? 'exam' : '') : esc(l.state)}">${l.state === 'cancelled' ? `<span class="hx-gone">${esc(l.subject)}</span> fällt aus` : `${l.state === 'changed' ? `${esc(l.from)} ` : ''}${esc(l.subject)}${l.exam ? ' Klausur' : l.state === 'changed' ? ' geändert' : ''}`}</span>`).join('')}</div>${hw}</div>`;
    }).join('') : '<p class="hx-empty">Schulfrei.</p>'));
  }
  const openEvents = () => { const now = Date.now(); return (data.events || []).filter((e) => !e.endAt || e.endAt > now); };
  const eventRow = (e) => { const running = e.startAt && e.startAt <= Date.now(); return `<li><span class="hx-when ${running ? 'hx-now' : ''}">${running ? 'Jetzt' : `${esc(dayLabel(e.date))}${e.time ? ` ${esc(e.time)}` : ''}`}</span><span class="hx-grow hx-wrap">${esc(e.title)}</span></li>`; };
  function todayCard() {
    const today = iso(new Date()); const ev = openEvents().filter((e) => e.date === today); const bd = (data.birthdays || []).filter((b) => b.inDays === 0);
    if (!ev.length && !bd.length) return '';
    return card('Heute noch', `<ul class="hx-list">${bd.map((b) => `<li><span class="hx-when hx-now">Geburtstag</span><span class="hx-grow hx-wrap">${esc(b.name)} wird ${Number(b.age)}</span></li>`).join('')}${ev.map(eventRow).join('')}</ul>`);
  }
  function events() {
    const today = iso(new Date()); const later = openEvents().filter((e) => e.date !== today);
    if (!data.eventsLoaded) return card('Termine', '<p class="hx-empty">Termine gerade nicht abrufbar.</p>');
    return card('Termine', later.length ? `<ul class="hx-list">${later.map(eventRow).join('')}</ul>` : '<p class="hx-empty">In den nächsten 14 Tagen steht sonst nichts an.</p>');
  }
  function birthdays() {
    const soon = (data.birthdays || []).filter((b) => b.inDays > 0);
    if (!soon.length) return '';
    return card('Geburtstage', `<ul class="hx-list">${soon.map((b) => `<li><span class="hx-when">${b.inDays === 1 ? 'Morgen' : `In ${b.inDays} Tagen`}</span><span class="hx-grow hx-wrap">${esc(b.name)} wird ${Number(b.age)}</span></li>`).join('')}</ul>`);
  }
  const noteOf = (r) => pending[r.id]?.note || (!r.reachable ? ['Nicht erreichbar', 'alarm'] : r.windowOpen ? ['Fenster offen', 'alarm'] : r.batteryLow ? ['Batterie schwach', 'alarm'] : r.heating ? ['Heizt', 'heat'] : r.mode === 'manual' ? ['Manuell eingestellt', ''] : ['', '']);
  const targetOf = (r) => pending[r.id]?.temp ?? r.target;
  const noteline = (r, n) => `<span class="hx-note ${n[1]}" role="status">${esc(n[0])}</span>${r.mode === 'manual' && !pending[r.id]?.plan ? `<button class="hx-btn" data-plan="${esc(r.id)}">Wieder nach Plan</button>` : ''}`;
  function roomRow(r) {
    const t = targetOf(r); const n = noteOf(r);
    return `<li class="hx-room" data-rowid="${esc(r.id)}"><span class="hx-grow">${esc(r.name)}<span class="hx-label">Ist</span><span class="hx-temp">${deg(r.temp)}</span></span><div class="hx-soll"><span class="hx-label">Soll</span><span class="hx-step"><button class="hx-btn" data-step="-0.5" data-room="${esc(r.id)}" aria-label="${esc(r.name)} kälter" ${t <= 7 ? 'disabled' : ''}>−</button><output>${deg(t)}</output><button class="hx-btn" data-step="0.5" data-room="${esc(r.id)}" aria-label="${esc(r.name)} wärmer" ${t >= 30 ? 'disabled' : ''}>+</button></span></div><div class="hx-noteline">${noteline(r, n)}</div></li>`;
  }
  function rooms() {
    const list = data.rooms || [];
    if (!list.length) return card('Raumklima', '<p class="hx-empty">Raumwerte gerade nicht abrufbar.</p>');
    const plan = data.heating?.mode || (data.heating?.plan ? `Plan: ${data.heating.plan}` : '');
    const sorted = [...list].sort((a, b) => (b.name === 'Wohnzimmer') - (a.name === 'Wohnzimmer'));
    return card('Raumklima', `<ul class="hx-list">${sorted.map(roomRow).join('')}</ul>`, esc(plan));
  }
  // Nur die eine Zeile neu zeichnen, damit Fokus und Bildlauf bleiben.
  function updateRoom(id) {
    const r = (data.rooms || []).find((x) => x.id === id); const li = host.querySelector(`[data-rowid="${CSS.escape(id)}"]`); if (!r || !li) return;
    const t = targetOf(r); const n = noteOf(r); li.querySelector('output').textContent = deg(t);
    li.querySelector('.hx-noteline').innerHTML = noteline(r, n);
    li.querySelector('[data-step="-0.5"]').disabled = t <= 7; li.querySelector('[data-step="0.5"]').disabled = t >= 30;
  }
  const scroller = () => { let e = host; while (e && e !== document.body) { if (e.scrollTop > 0 || /auto|scroll/.test(getComputedStyle(e).overflowY)) return e; e = e.parentElement; } return document.scrollingElement; };
  function failed() { host.innerHTML = '<main class="hx"><section class="hx-card" role="alert"><h2>Heute konnte nicht geladen werden</h2><p class="hx-empty">Bitte prüfe die Verbindung.</p><button class="hx-btn" onclick="location.reload()">Nochmal versuchen</button></section></main>'; }
  function render() {
    if (!data) { failed(); return; }
    const d = new Date();
    const alerts = (data.alerts || []).map((a) => `<div class="hx-alert" role="status"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 21h20zM12 10v5M12 18h.01"/></svg><b>${esc(a.text || a.summary || a.label)}</b><small>${esc(a.text || a.summary ? a.label : '')}</small></div>`).join('');
    const sc = scroller(); const top = sc.scrollTop; const f = document.activeElement?.dataset || {}; const key = f.room ? `[data-room="${f.room}"][data-step="${f.step}"]` : f.day ? `[data-day="${f.day}"]` : '';
    AppShell.render(host, `<main class="hx"><header class="hx-head"><div><h1>Heute</h1><p>${DAYS[d.getDay()]}, ${d.getDate()}. ${d.toLocaleString('de-DE', { month: 'long' })}</p></div>${wx ? `<div class="hx-wx"><b>${deg(Math.round(wx.t))}</b><small>${esc(SKY(wx.c))}</small><small>bis ${deg(Math.round(wx.max))} · Regen ${wx.rain} %</small></div>` : ''}</header>${stale ? `<p class="hx-stale" role="status">Keine Verbindung. Stand ${esc(at || '')}.</p>` : ''}<div class="hx-grid"><div class="hx-col">${alerts}${todayCard()}${transit()}${school()}</div><div class="hx-col">${events()}${birthdays()}${rooms()}</div></div></main>`);
    sc.scrollTop = top; if (key) host.querySelector(key)?.focus();
  }
  async function load(fresh) {
    try {
      const r = await fetch(`${BASE}/api/today${fresh ? '?fresh=1' : ''}`);
      if (r.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
      if (!r.ok) throw new Error('fehlgeschlagen');
      data = await r.json(); stale = false;
      for (const id of Object.keys(pending)) { const p = pending[id]; const room = (data.rooms || []).find((x) => x.id === id); if (p.confirm && (Date.now() > p.until || (room && (p.plan ? room.mode !== 'manual' : room.target === p.temp)))) delete pending[id]; } at = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { stale = true; }
    render();
  }
  function settle(id, seq, state) {
    if (seq !== seqs[id]) return; // Eine neuere Eingabe gilt.
    // Netatmo meldet den neuen Wert verzögert: Bis er ankommt, bleibt der gesetzte Wert stehen.
    const temp = pending[id]?.temp;
    pending[id] = state === 'ok' ? { temp, plan: pending[id]?.plan, note: ['Gespeichert', ''], confirm: true, until: Date.now() + 60000 } : { note: ['Nicht gespeichert, bitte nochmal', 'alarm'] };
    updateRoom(id);
    setTimeout(() => { if (seq !== seqs[id] || !pending[id]) return; if (state === 'ok') pending[id].note = null; else delete pending[id]; updateRoom(id); }, state === 'ok' ? 2000 : 4000);
    if (state === 'ok') setTimeout(() => load(false), 12000);
  }
  async function send(room, body) {
    const seq = seqs[room];
    try {
      const r = await fetch(`${BASE}/api/heating`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room, ...body }) });
      if (!r.ok) throw new Error('fehlgeschlagen');
      const next = await r.json(); if (seq === seqs[room]) { data = { ...data, ...next }; }
      settle(room, seq, 'ok');
    } catch (e) { settle(room, seq, 'fail'); }
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.day) { dayIndex = Number(d.day); picked = true; render(); }
    else if (d.plan) { seqs[d.plan] = (seqs[d.plan] || 0) + 1; pending[d.plan] = { plan: true, note: ['Wird gesetzt …', ''] }; updateRoom(d.plan); send(d.plan, { backToPlan: true }); }
    else if (d.step) {
      const r = data.rooms.find((x) => x.id === d.room); const temp = Math.min(30, Math.max(7, (targetOf(r) ?? 20) + Number(d.step)));
      clearTimeout(pending[d.room]?.timer); seqs[d.room] = (seqs[d.room] || 0) + 1;
      pending[d.room] = { temp, note: ['Wird gesetzt …', ''], timer: setTimeout(() => send(d.room, { temp }), 1200) };
      updateRoom(d.room);
    }
  });
  async function weather() {
    try { const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,weather_code&daily=temperature_2m_max,precipitation_probability_max&timezone=Europe%2FBerlin&forecast_days=1'); const j = await r.json(); wx = { t: j.current.temperature_2m, c: j.current.weather_code, max: j.daily.temperature_2m_max[0], rain: j.daily.precipitation_probability_max[0] }; if (data) render(); } catch (e) { /* ohne Wetter weiter */ }
  }
  try { Navbar.render('today', await (await fetch(`${BASE}/api/me`)).json()); } catch (e) { /* Seite geht auch ohne Benutzermenü */ }
  await load(true); weather(); setInterval(weather, 1_800_000);
  setInterval(() => { if (!document.hidden && !Object.values(pending).some((p) => p.timer || (p.note && !p.confirm))) load(false); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
  setInterval(() => { if (!document.hidden && data) render(); }, 30_000);
})();
