// Startbild des Beamers: Menue links, Uhr, Wetter, Schultag, Radio und Stimmungen. Bewusst altes JavaScript fuer Tizen 5.5.
window.BHHome = (function () {
  'use strict';
  var LAT = 52.52; var LON = 13.41; var PLACE = 'Berlin'; var COLS = { radio: 4, mood: 3 };
  var DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var homeEl = document.getElementById('home');
  var PAGES = ['start', 'radio', 'mood'];
  var page = 'start'; var zone = 'content'; var sideTimer = null; var grids = {}; var signature = ''; var playingId = null; var audio = 'load';
  var tuneTimer = null; var plan = null; var dayIndex = 0; var lastDay = '';
  var api = { onTune: function () {}, onMood: function () {}, isRadioOn: function () { return false; } };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  function dayLabel(date) {
    var n = new Date(); var t = iso(n); n.setDate(n.getDate() + 1);
    return date === t ? 'Heute' : date === iso(n) ? 'Morgen' : DAYS[new Date(date + 'T12:00:00').getDay()] + ', ' + date.slice(8) + '.' + date.slice(5, 7) + '.';
  }
  function merged(lessons) {
    var out = [];
    lessons.forEach(function (l) { var p = out[out.length - 1]; if (!p || p.subject !== l.subject || p.state !== l.state || p.exam !== l.exam) out.push(l); });
    return out;
  }

  function tick() {
    var d = new Date();
    document.getElementById('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    document.getElementById('date').textContent = DAYS[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()];
    if (iso(d) !== lastDay) { lastDay = iso(d); renderDay(); }
  }

  function sky(code) {
    if (code === 0) return 'Klar';
    if (code <= 2) return 'Leicht bewölkt';
    if (code === 3) return 'Bedeckt';
    if (code <= 48) return 'Nebel';
    if (code <= 67 || (code >= 80 && code <= 82)) return 'Regen';
    if (code <= 77 || code === 85 || code === 86) return 'Schnee';
    return 'Gewitter';
  }
  var CLOUD = '<path class="cloud-a" fill="#fff" d="M30 80h60a20 20 0 0 0 4-39 29 29 0 0 0-55-7 23 23 0 0 0-9 46z"/>';
  var RAYS = '<g class="sun-rays" stroke="#fde68a" stroke-width="6" stroke-linecap="round"><path d="M66 6v10M66 84v10M22 50h10M100 50h10M35 19l7 7M90 74l7 7M35 81l7-7M90 26l7-7"/></g>';
  var SUN = RAYS + '<circle cx="66" cy="50" r="24" fill="#fcd34d"/>';
  var MOON = '<path fill="#fde68a" d="M78 16a36 36 0 1 0 22 56 30 30 0 0 1-22-56z"/>';
  function drops(cls, draw) { return [34, 60, 86].map(function (x, i) { return draw(x, cls + (i ? ' d' + (i + 1) : '')); }).join(''); }
  function icon(code, day) {
    var clear = day ? SUN : MOON; var body;
    if (code <= 1) body = clear;
    else if (code === 2) body = '<g transform="translate(22 -14) scale(.72)">' + clear + '</g>' + CLOUD;
    else if (code === 3) body = CLOUD;
    else if (code <= 48) body = [30, 52, 74].map(function (y, i) { return '<rect class="fog' + (i === 1 ? ' d2' : '') + '" x="' + (14 + i * 8) + '" y="' + y + '" width="92" height="9" rx="4.5" fill="#fff"/>'; }).join('');
    else if (code >= 95) body = CLOUD + '<path class="bolt" fill="#fde047" d="M62 76l-14 22h13l-6 18 21-26H62l9-14z"/>';
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) body = CLOUD + drops('flake', function (x, c) { return '<circle class="' + c + '" cx="' + x + '" cy="92" r="5" fill="#fff"/>'; });
    else body = CLOUD + drops('drop', function (x, c) { return '<path class="' + c + '" d="M' + x + ' 86l-6 16" stroke="#dbeafe" stroke-width="6" stroke-linecap="round"/>'; });
    return '<svg viewBox="0 0 132 110" aria-hidden="true">' + body + '</svg>';
  }

  function weather() {
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=temperature_2m,weather_code,is_day&timezone=Europe%2FBerlin');
    x.onload = function () {
      try {
        var now = JSON.parse(x.responseText).current;
        document.getElementById('temp').textContent = Math.round(now.temperature_2m) + '°';
        document.getElementById('sky').textContent = sky(now.weather_code) + ' · ' + PLACE;
        document.getElementById('wx').innerHTML = icon(now.weather_code, now.is_day !== 0);
      } catch (e) { /* naechster Versuch */ }
    };
    x.send();
  }

  // Abfahrten direkt von der BVG: nur wenn der Start-Bildschirm sichtbar ist, einmal pro Minute.
  var transitStop = null; var transitAt = 0;
  function departures() {
    var el = document.getElementById('transit');
    if (!transitStop || document.body.className.indexOf('home') < 0 || page !== 'start') return;
    transitAt = Date.now();
    var x = new XMLHttpRequest();
    x.open('GET', 'https://v6.bvg.transport.rest/stops/' + transitStop.id + '/departures?duration=45&results=3&remarks=false');
    x.timeout = 12000;
    x.onload = function () {
      try {
        var list = JSON.parse(x.responseText).departures || [];
        el.className = list.length ? 'on' : '';
        el.innerHTML = '<span class="stop">' + esc(transitStop.name) + '</span>' + list.map(function (d) {
          var when = new Date(d.when || d.plannedWhen); var min = Math.max(0, Math.round((when - Date.now()) / 60000));
          var late = (d.delay || 0) >= 180;
          return '<span class="dep' + (d.cancelled ? ' off' : late ? ' late' : '') + '"><b>' + esc(d.line && d.line.name || '?') + '</b><span>' + esc(String(d.direction || '')) + '</span><i>' + (d.cancelled ? 'fällt aus' : (min ? min + ' Min' : 'jetzt') + (late ? ' (+' + Math.round(d.delay / 60) + ')' : '')) + '</i></span>';
        }).join('');
      } catch (e) { el.className = ''; }
    };
    x.onerror = x.ontimeout = function () { el.className = ''; };
    x.send();
  }

  function renderDay() {
    var el = document.getElementById('today');
    var days = plan && plan.days ? plan.days.filter(function (d) { return d.date >= iso(new Date()); }) : [];
    if (!days.length) { el.className = ''; return; }
    dayIndex = Math.min(dayIndex, days.length - 1);
    var day = days[dayIndex]; var kids = day.kids.filter(function (k) { return k.lessons.length; });
    el.className = 'on';
    el.innerHTML = '<div class="day-head"><h3>' + esc(dayLabel(day.date)) + '</h3><span>' + (dayIndex ? '◀ ' : '') + (dayIndex < days.length - 1 ? 'Nächster Tag ▶' : '') + '</span></div><div class="kids">' + (kids.length ? kids.map(function (k) {
      var live = k.lessons.filter(function (l) { return l.state !== 'cancelled'; });
      var time = live.length ? live[0].from + ' – ' + live[live.length - 1].to : 'alles fällt aus';
      var homework = k.homework && k.homework.length ? '<div class="hw">' + k.homework.slice(0, 3).map(function (h) { return '<div><b>' + esc(h.subject) + '</b> ' + esc(h.text) + '</div>'; }).join('') + '</div>' : '';
      return '<div class="kid"><div class="kid-head">' + esc(k.name) + '<span>' + esc(time) + '</span></div><div class="kid-plan">' + merged(k.lessons).map(function (l) {
        var cls = l.state === 'regular' ? (l.exam ? 'exam' : '') : l.state;
        return '<span class="lb ' + cls + '">' + esc(l.subject) + (l.exam ? ' Klausur' : l.state === 'changed' ? ' geändert' : '') + '</span>';
      }).join('') + '</div>' + homework + '</div>';
    }).join('') : '<div class="kid"><div class="kid-head">Schulfrei</div></div>') + '</div>';
  }

  function paint() {
    homeEl.setAttribute('data-page', page);
    homeEl.className = zone === 'side' ? 'menu' : '';
    var items = document.querySelectorAll('.side-item');
    for (var i = 0; i < items.length; i++) {
      var p = items[i].getAttribute('data-page');
      items[i].className = 'side-item' + (p === page ? ' current' : '') + (zone === 'side' && p === page ? ' focus' : '');
    }
    Object.keys(grids).forEach(function (name) {
      var g = grids[name]; var tiles = g.el.querySelectorAll('.tile');
      for (var k = 0; k < tiles.length; k++) {
        tiles[k].className = tiles[k].className.replace(/ (focus|playing)/g, '');
        if (zone === 'content' && page === name && k === g.at) tiles[k].className += ' focus';
        if (name === 'radio') {
          var on = g.items[k].id === playingId;
          if (on && audio === 'ok') tiles[k].className += ' playing';
          var sub = g.items[k].sub || '';
          tiles[k].querySelector('small').textContent = !on ? sub : audio === 'fail' ? 'Nicht erreichbar' : (audio === 'ok' ? 'Läuft · ' : 'Verbinde · ') + sub;
        }
      }
    });
  }

  function buildGrid(name, title, items, tile) {
    var el = document.getElementById('grid-' + name);
    el.innerHTML = '<h2>' + title + '</h2><div>' + items.map(tile).join('') + '</div>';
    grids[name] = { items: items, el: el, at: 0 };
  }

  function setMenu(menu) {
    if (!menu) return;
    plan = menu.schedule || null; renderDay();
    if (menu.transit && (!transitStop || transitStop.id !== menu.transit.id)) { transitStop = menu.transit; departures(); }
    var next = JSON.stringify([menu.radio, menu.mood]);
    if (next === signature) return;
    signature = next;
    buildGrid('radio', 'Radio', menu.radio || [], function (x) { return '<div class="tile station">' + esc(x.name) + '<small>' + esc(x.sub || '') + '</small></div>'; });
    buildGrid('mood', 'Stimmung', menu.mood || [], function (x) { return '<div class="tile mood"><img src="' + esc(x.thumb) + '" alt=""><span>' + esc(x.label) + '</span></div>'; });
    paint();
  }

  function indexOfPlaying() {
    var g = grids.radio; if (!g) return -1;
    for (var i = 0; i < g.items.length; i++) if (g.items[i].id === playingId) return i;
    return -1;
  }
  function setPlaying(id) {
    playingId = id;
    if (id && !tuneTimer && indexOfPlaying() >= 0) grids.radio.at = indexOfPlaying();
    paint();
  }
  function tuneSoon(st) {
    if (api.onPreview) api.onPreview(st);
    clearTimeout(tuneTimer);
    tuneTimer = setTimeout(function () { tuneTimer = null; if (api.isRadioOn()) api.onTune(st); }, 500);
  }
  function step(dir) {
    var g = grids.radio; if (!g || !g.items.length) return null;
    var at = indexOfPlaying();
    var next = at < 0 ? 0 : (at + dir + g.items.length) % g.items.length;
    playingId = g.items[next].id; g.at = next; paint();
    return g.items[next];
  }

  function moveGrid(dx, dy) {
    var g = grids[page]; if (!g) return;
    var cols = COLS[page]; var col = g.at % cols;
    if (dx < 0 && col === 0) { setZone('side'); return; }
    if (dx > 0 && col === cols - 1) return;
    var to = g.at + dx + dy * cols;
    if (dy > 0 && to >= g.items.length && Math.floor(g.at / cols) < Math.floor((g.items.length - 1) / cols)) to = g.items.length - 1;
    if (to < 0 || to >= g.items.length) return;
    g.at = to; paint();
  }
  function moveStart(key) {
    var count = plan && plan.days ? plan.days.length : 0;
    if (key === 37) { if (dayIndex > 0) { dayIndex--; renderDay(); } else { setZone('side'); } }
    else if (key === 39) { if (dayIndex < count - 1) { dayIndex++; renderDay(); } }
    else if (api.isRadioOn()) { var st = step(key === 40 ? 1 : -1); if (st) tuneSoon(st); }
  }
  // Das Menue schliesst sich von selbst, wenn nichts mehr gedrueckt wird.
  function setZone(z) {
    zone = z; clearTimeout(sideTimer);
    if (z === 'side') sideTimer = setTimeout(function () { setZone('content'); }, 8000);
    paint();
  }
  function moveSide(key) {
    if (key === 39) { setZone('content'); return; }
    setZone('side');
    if (key !== 38 && key !== 40) return;
    var i = PAGES.indexOf(page) + (key === 40 ? 1 : -1);
    if (i >= 0 && i < PAGES.length) { page = PAGES[i]; paint(); }
  }
  function enter() {
    if (zone === 'side') { setZone('content'); return; }
    if (page === 'start') return;
    clearTimeout(tuneTimer); tuneTimer = null;
    var g = grids[page]; if (!g) return;
    if (page === 'radio') api.onTune(g.items[g.at]); else api.onMood(g.items[g.at]);
  }

  document.addEventListener('keydown', function (e) {
    if (document.body.className.indexOf('home') < 0) return;
    var k = e.keyCode;
    if (k === 13) enter();
    else if (k < 37 || k > 40) return;
    else if (zone === 'side') moveSide(k);
    else if (page === 'start') moveStart(k);
    else moveGrid(k === 37 ? -1 : k === 39 ? 1 : 0, k === 38 ? -1 : k === 40 ? 1 : 0);
    e.preventDefault();
  });

  // Zurueck: erst zurueck zum Start-Inhalt, danach entscheidet main.js.
  api.back = function () {
    clearTimeout(tuneTimer); tuneTimer = null;
    if (zone === 'side') { setZone('content'); return true; }
    if (page !== 'start') { page = 'start'; dayIndex = 0; renderDay(); paint(); return true; }
    if (dayIndex) { dayIndex = 0; renderDay(); return true; }
    return false;
  };
  tick(); setInterval(tick, 5000);
  weather(); setInterval(weather, 900000);
  setInterval(function () { if (Date.now() - transitAt >= 60000) departures(); }, 5000);
  api.step = step; api.setState = function (s) { audio = s; paint(); };
  api.setMenu = setMenu; api.setPlaying = setPlaying;
  paint();
  return api;
})();
