'use strict';
/** Markup der Bedienseite: nur Darstellung, die Logik steht in pages/home-page.js. */
window.BeamerView = (() => {
  const esc = (s) => AppShell.esc(s);
  const data = (o) => esc(JSON.stringify(o));
  const svg = (d, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const I = {
    up: svg('M6 15l6-6 6 6'), down: svg('M6 9l6 6 6-6'), left: svg('M15 6l-6 6 6 6'), right: svg('M9 6l6 6-6 6'),
    back: svg('M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', 20), home: svg('M3 11l9-8 9 8M5 10v10h14V10', 20),
    plus: svg('M12 5v14M5 12h14'), minus: svg('M5 12h14'), mute: svg('M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6'),
    playpause: svg('M6 5v14l8-7zM17 5v14M21 5v14', 20), stop: svg('M6 6h12v12H6z', 16), remote: svg('M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 7h.01M12 12h.01'),
    radio: svg('M4 9v11h16V9zM4 9l13-5M8 15h.01M13 13h4M13 16h4', 18),
  };
  const key = (k, label, aria, cls = '') => `<button type="button" class="bm-key ${cls}" data-key="${k}" aria-label="${aria}">${label}</button>`;
  const section = (title, body) => `<section class="bm-section"><h2>${title}</h2>${body}</section>`;
  const moodTile = (m) => `<button type="button" class="bm-mood" data-send="/mood" data-label="${esc(m.label)}" data-body="${data({ id: m.id })}" data-now="mood:${esc(m.id)}"><img src="${esc(m.thumb)}" alt="" loading="lazy"><span class="bm-mood-name">${esc(m.label)}</span><span class="bm-badge">Läuft</span></button>`;
  const stationTile = (s) => `<button type="button" class="bm-station" data-send="/radio" data-label="${esc(s.name)}" data-body="${data({ id: s.id })}" data-now="radio:${esc(s.id)}">${I.radio}<span><b>${esc(s.name)}</b><small>${esc(s.sub)}</small></span></button>`;
  const appTile = (a) => `<button type="button" class="bm-app" data-send="/app" data-label="${esc(a)}" data-body="${data({ app: a })}" data-now="app:${esc(a)}"><span class="bm-mono" aria-hidden="true">${esc(a[0])}</span><span>${esc(a)}</span></button>`;
  const form = (id, label, name, placeholder, cta, type = 'text') => `<form class="bm-form" data-form="${id}"><label class="bh-label" for="f-${id}">${label}</label><input id="f-${id}" class="bh-input" name="${name}" type="${type}" placeholder="${placeholder}" required autocomplete="off"><button class="bh-btn">${cta}</button></form>`;

  function schedule(plan) {
    if (!plan) return scheduleError();
    const kids = (plan.kids || []).filter((k) => k.lessons.length);
    const merged = (list) => list.filter((l, i) => !i || list[i - 1].subject !== l.subject || list[i - 1].state !== l.state || list[i - 1].exam !== l.exam);
    const tag = (l) => `<span class="bm-l ${l.state === 'regular' ? (l.exam ? 'exam' : '') : l.state}" title="${esc(l.title || '')}">${esc(l.subject)}${l.exam ? ' Klausur' : l.state === 'changed' ? ' geändert' : ''}</span>`;
    const kid = (k) => { const live = k.lessons.filter((l) => l.state !== 'cancelled'); return `<div class="bm-kid"><span class="bm-mono" aria-hidden="true">${esc(k.name[0])}</span><b>${esc(k.name)}</b><small>${live.length ? `${esc(live[0].from)} – ${esc(live[live.length - 1].to)}` : 'alles fällt aus'}</small><div class="bm-blocks">${merged(k.lessons).map(tag).join('')}</div></div>`; };
    return `<h2>Schultag · ${esc(plan.label)}</h2><div class="bm-kids">${kids.length ? kids.map(kid).join('') : '<div class="bm-kid"><b>Schulfrei</b></div>'}</div>`;
  }

  const scheduleError = () => '<h2>Schultag</h2><p class="bm-hint">Plan gerade nicht abrufbar.</p>';

  function hero() {
    return `<section class="bm-hero" id="bm-hero"><img id="bm-hero-img" alt="" hidden><div class="bm-hero-body" aria-live="polite" aria-atomic="true"><span class="bm-state" id="bm-state">Wird geprüft</span><h1 id="bm-title">Beamer</h1><p id="bm-sub"></p></div>
      <div class="bm-hero-actions"><button type="button" class="bh-btn bh-btn-primary" data-stop hidden>${I.stop}Stoppen</button><button type="button" class="bh-btn bh-btn-primary" data-power="on" hidden>Einschalten</button><button type="button" class="bh-btn bm-off" data-power="off" hidden>Ausschalten</button><button type="button" class="bh-btn bh-btn-danger" data-power-confirm hidden>Ja, ausschalten</button><button type="button" class="bh-btn" data-power-cancel hidden>Abbrechen</button></div></section>`;
  }

  function remote() {
    return `<div class="bm-remote"><div class="bm-pad"><span></span>${key('KEY_UP', I.up, 'Hoch')}<span></span>${key('KEY_LEFT', I.left, 'Links')}${key('KEY_ENTER', 'OK', 'Bestätigen', 'bm-ok')}${key('KEY_RIGHT', I.right, 'Rechts')}<span></span>${key('KEY_DOWN', I.down, 'Runter')}<span></span></div>
      <div class="bm-row3">${key('KEY_RETURN', `${I.back}<span>Zurück</span>`, 'Zurück')}${key('KEY_HOME', `${I.home}<span>Home</span>`, 'Startseite')}${key('TOGGLE', I.playpause, 'Wiedergabe oder Pause')}</div>
      <div class="bm-row3">${key('KEY_VOLDOWN', I.minus, 'Leiser')}${key('KEY_MUTE', I.mute, 'Stumm')}${key('KEY_VOLUP', I.plus, 'Lauter')}</div></div>`;
  }

  function page(c) {
    const screen = BeamerShare.canScreen();
    const share = `<div class="bm-share">${screen ? '<button type="button" class="bh-btn" data-share="screen">Bildschirm teilen</button>' : ''}<button type="button" class="bh-btn" data-share="camera">Kamera zeigen</button></div><p class="bm-hint" id="bm-share-state" aria-live="polite">${screen ? 'Der Laptop muss im Heimnetz sein.' : 'Das Handy muss im Heimnetz sein.'}</p>`;
    return `${hero()}
      <div class="bm-nowbar" id="bm-nowbar" hidden><span id="bm-nowbar-text"></span><button type="button" class="bh-btn bh-btn-primary" data-stop hidden>${I.stop}Stoppen</button><button type="button" class="bh-btn" data-goto-remote aria-label="Fernbedienung">${I.remote}</button></div>
      <div class="bm-view" role="tablist" aria-label="Ansicht"><button type="button" role="tab" data-view="start" aria-selected="true">Starten</button><button type="button" role="tab" data-view="remote" aria-selected="false">Fernbedienung</button></div>
      <div class="bm-layout" id="bm-layout" data-view="start"><div class="bm-main">
        <section class="bm-section" id="bm-schedule"><h2>Schultag</h2><p class="bm-hint">Wird geladen …</p></section>
        ${section('Stimmung', `<div class="bm-moods">${c.moods.map(moodTile).join('')}</div>`)}
        ${section('Radio', `<div class="bm-stations">${c.stations.map(stationTile).join('')}</div>`)}
        ${section('Apps', `<div class="bm-apps">${c.apps.map(appTile).join('')}</div>`)}
        ${section(screen ? 'Vom Laptop zeigen' : 'Kamera zeigen', share)}
        <details class="bm-section bm-more" id="bm-more"><summary>Eigene Inhalte</summary><div class="bm-forms">${form('youtube', 'YouTube-Link', 'video', 'https://youtu.be/…', 'Abspielen')}${form('text', 'Text anzeigen', 'title', 'Hallo zusammen', 'Anzeigen')}${form('url', 'Webseite öffnen', 'url', 'https://…', 'Öffnen', 'url')}</div></details>
      </div><aside class="bm-side">${section('Fernbedienung', remote())}</aside></div>`;
  }

  return { page, schedule, scheduleError };
})();
