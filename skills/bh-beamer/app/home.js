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
    return date === t ? 'Heute' : date === iso(n) ? 'Morgen' : DAYS[new Date(date + 'T12:00:00').getDay()].slice(0, 2) + ' ' + Number(date.slice(8)) + '.';
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
  // Wetter als bewegter Hintergrund der rechten oberen Ecke.
  var CLOUD_PATH = 'M30 80h60a20 20 0 0 0 4-39 29 29 0 0 0-55-7 23 23 0 0 0-9 46z';
  var SPOTS = [[660, 6, 330, .46, 24], [330, 44, 430, .36, 34], [840, 110, 270, .34, 19], [90, 8, 340, .26, 40], [520, 150, 380, .3, 28], [900, -24, 330, .42, 22]];
  function cloud(s, fill) {
    return '<svg class="wc" viewBox="0 0 120 90" style="left:' + s[0] + 'px;top:' + s[1] + 'px;width:' + s[2] + 'px;opacity:' + s[3] + ';animation-duration:' + s[4] + 's"><path fill="' + fill + '" d="' + CLOUD_PATH + '"/></svg>';
  }
  function fall(cls, count, dur) {
    var out = '';
    for (var i = 0; i < count; i++) out += '<i class="' + cls + '" style="left:' + (120 + (i * 137) % 960) + 'px;top:' + ((i * 53) % 120 - 20) + 'px;animation-delay:' + ((i * 0.17) % dur).toFixed(2) + 's"></i>';
    return out;
  }
  function scene(code, day) {
    var rain = code >= 51 && code <= 67 || (code >= 80 && code <= 82);
    var snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
    var storm = code >= 95; var fog = code > 3 && code <= 48;
    var count = code <= 1 ? 1 : code === 2 ? 3 : 6;
    var fill = rain || storm ? '#dbe4f3' : '#ffffff';
    var html = code <= 2 ? (day ? '<div class="wsun"><svg class="wrays" viewBox="0 0 240 240"><g stroke="#fde68a" stroke-width="10" stroke-linecap="round"><path d="M120 8v28M120 204v28M8 120h28M204 120h28M41 41l20 20M179 179l20 20M41 199l20-20M179 61l20-20"/></g></svg><span></span></div>' : '<div class="wmoon"></div>') : '';
    for (var i = 0; i < count; i++) html += cloud(SPOTS[i], fill);
    if (fog) html += '<u class="wfog"></u><u class="wfog f2"></u><u class="wfog f3"></u>';
    if (rain || storm) html += fall('wr', 34, 1);
    if (snow) html += fall('ws', 30, 4);
    if (storm) html += '<b class="wflash"></b>';
    return html;
  }

  function weather() {
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=temperature_2m,weather_code,is_day&timezone=Europe%2FBerlin');
    x.onload = function () {
      try {
        var now = JSON.parse(x.responseText).current;
        document.getElementById('temp').textContent = Math.round(now.temperature_2m) + '°';
        document.getElementById('sky').textContent = sky(now.weather_code) + ' · ' + PLACE;
        document.getElementById('wxbg').innerHTML = scene(now.weather_code, now.is_day !== 0);
      } catch (e) { /* naechster Versuch */ }
    };
    x.send();
  }

  // Abfahrten kommen ueber die App vom Skill bvg; die Minuten rechnet der Beamer selbst weiter.
  var board = null;
  function renderBoard() {
    var el = document.getElementById('transit');
    var upcoming = board && board.departures ? board.departures.filter(function (d) { return new Date(d.when) >= Date.now() - 60000; }) : [];
    if (!upcoming.length) { el.className = ''; return; }
    el.className = 'on';
    el.innerHTML = '<span class="stop">' + esc(board.stop) + (board.morning ? ' · Westen' : '') + '</span>' + upcoming.map(function (d) {
      var min = Math.max(0, Math.round((new Date(d.when) - Date.now()) / 60000));
      var late = d.delayMinutes >= 3;
      return '<span class="dep' + (d.cancelled ? ' off' : late ? ' late' : '') + '"><b>' + esc(d.line) + '</b><span>' + esc(d.direction) + '</span><i>' + (d.cancelled ? 'fällt aus' : (min ? min + ' Min' : 'jetzt') + (late ? ' (+' + d.delayMinutes + ')' : '')) + '</i></span>';
    }).join('');
  }

  function renderDay() {
    var el = document.getElementById('today');
    var days = plan && plan.days ? plan.days.filter(function (d) { return d.date >= iso(new Date()); }) : [];
    if (!days.length) { el.className = ''; return; }
    dayIndex = Math.min(dayIndex, days.length - 1);
    var day = days[dayIndex]; var kids = day.kids.filter(function (k) { return k.lessons.length; });
    el.className = 'on';
    el.innerHTML = '<div class="day-tabs">' + days.map(function (d, i) { return '<span class="' + (i === dayIndex ? 'on' : '') + '">' + esc(dayLabel(d.date)) + '</span>'; }).join('') + '<em>◀ ▶ Tag wechseln</em></div><div class="kids">' + (kids.length ? kids.map(function (k) {
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
    var alertsEl = document.getElementById('alerts'); var alerts = menu.alerts || [];
    alertsEl.className = alerts.length ? 'on' : '';
    alertsEl.innerHTML = alerts.slice(0, 2).map(function (a) { return '<div class="alert"><svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2zM12 10v5M12 18h.01"/></svg><b>' + esc(a.label) + '</b><span>' + esc(a.text) + '</span></div>'; }).join('');
    board = menu.board || null; renderBoard();
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
  setInterval(renderBoard, 20000);
  api.step = step; api.setState = function (s) { audio = s; paint(); };
  api.setMenu = setMenu; api.setPlaying = setPlaying;
  paint();
  return api;
})();
