// Beamer start screen: menu on the left, clock, weather, school day, radio and moods. Deliberately old JavaScript for Tizen 5.5.
window.BHHome = (function () {
  'use strict';
  var LAT = 52.52; var LON = 13.41; var PLACE = 'Berlin'; var COLS = { radio: 4, mood: 3, rooms: 3, photos: 4 };
  var DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var homeEl = document.getElementById('home');
  var PAGES = ['start', 'radio', 'mood', 'photos', 'rooms'];
  var ALBUM_ROW = 136; var ALL_ALBUMS = { id: 'all', label: 'Alle Alben', when: 'Zufällig gemischt', playAll: true };
  var page = 'start'; var zone = 'content'; var sideTimer = null; var grids = {}; var signature = ''; var playingId = null; var audio = 'load';
  var tuneTimer = null; var plan = null; var dayIndex = 0; var lastDay = ''; var party = null; var partyView = true; var tight = false;
  var edit = null; var pending = null; var heating = null; var events = []; var rooms = []; var roomsSig = ''; var room = 'Wohnzimmer';
  try { room = localStorage.getItem('bh-room') || room; } catch (e) { /* without storage it stays the living room */ }
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

  // Bright in the morning and by day, warm in the evening, dark at night.
  function dayPhase(h) { return h >= 5 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night'; }
  var stars = document.getElementById('stars'); var si = '';
  for (var n = 0; n < 70; n++) {
    var sx = (n * 277) % 1900; var sy = (n * 89) % 500;
    // No stars behind clock, date and weather text: there they read like punctuation marks.
    if ((sx >= 70 && sx <= 540 && sy >= 40 && sy <= 310) || (sx >= 1420 && sx <= 1860 && sy >= 150 && sy <= 260)) continue;
    si += '<i style="left:' + sx + 'px;top:' + sy + 'px;animation-delay:' + ((n * 0.31) % 4).toFixed(2) + 's"></i>';
  }
  stars.innerHTML = si;

  function tick() {
    var d = new Date();
    homeEl.setAttribute('data-time', dayPhase(d.getHours()));
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
  // Weather as an animated background in the top right corner.
  var CLOUD_PATH = 'M30 80h60a20 20 0 0 0 4-39 29 29 0 0 0-55-7 23 23 0 0 0-9 46z';
  // Temperature and text sit on the right: clouds stay thin there so that the text remains readable.
  var SPOTS = [[620, 6, 330, .3, 24], [300, 44, 430, .38, 34], [860, 120, 270, .2, 19], [90, 8, 340, .28, 40], [500, 150, 380, .32, 28], [900, -24, 330, .24, 22]];
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
    if (homeEl.getAttribute('data-time') === 'night') fill = '#64748b';
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
    x.open('GET', 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,precipitation_probability_max&forecast_days=1&timezone=Europe%2FBerlin');
    x.onload = function () {
      try {
        var data = JSON.parse(x.responseText); var now = data.current; var today = data.daily || {};
        document.getElementById('temp').textContent = Math.round(now.temperature_2m) + '°';
        document.getElementById('sky').textContent = sky(now.weather_code) + ' · ' + PLACE;
        var hi = today.temperature_2m_max; var rain = today.precipitation_probability_max;
        document.getElementById('wxday').textContent = hi && hi.length ? 'Heute bis ' + Math.round(hi[0]) + '°' + (rain && rain[0] !== null ? ' · Regen ' + rain[0] + ' %' : '') : '';
        document.getElementById('wxbg').innerHTML = scene(now.weather_code, now.is_day !== 0);
      } catch (e) { /* next attempt */ }
    };
    x.send();
  }

  // Departures come through the app from skill bvg; the Beamer keeps counting the minutes itself.
  var board = null;
  function renderBoard() {
    var el = document.getElementById('transit');
    var upcoming = board && board.departures ? board.departures.filter(function (d) { return new Date(d.when) >= Date.now() - 60000; }) : [];
    if (!upcoming.length) { el.className = ''; return; }
    el.className = 'on';
    el.innerHTML = '<span class="stop">' + esc(board.stop) + (board.morning ? ' · Westen' : '') + '</span>' + upcoming.map(function (d) {
      var min = Math.max(0, Math.round((new Date(d.when) - Date.now()) / 60000));
      var late = d.delayMinutes >= 3;
      return '<span class="dep' + (d.cancelled ? ' off' : late ? ' late' : '') + '"><b>' + esc(d.line) + '</b>' + (d.towards ? '<em class="' + (d.towards === 'Westen' ? 'w' : '') + '">' + (d.towards === 'Westen' ? '← Westen' : 'Zoo →') + '</em>' : '') + '<span>' + esc(d.direction) + '</span><i>' + (d.cancelled ? 'fällt aus' : (min ? min + ' Min' : 'jetzt') + (late ? ' (+' + d.delayMinutes + ')' : '')) + '</i></span>';
    }).join('');
  }

  function notable(d) { return d.kids.some(function (k) { return k.lessons.some(function (l) { return l.state !== 'regular' || l.exam; }); }); }

  var CAL = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 3v4M16 3v4M4 10h16"/></svg>';
  // Only if there is room: disruptions, birthdays and a long schedule take priority.
  function renderEvents() {
    var el = document.getElementById('events'); var today = document.getElementById('today');
    var free = !tight && !(party && partyView) && today.offsetTop + today.offsetHeight <= 784;
    var now = Date.now(); var open = events.filter(function (e) { return !e.endAt || e.endAt > now; });
    if (!open.length || !free) { el.className = ''; return; }
    el.className = 'on';
    var html = CAL + open.slice(0, 3).map(function (e) {
      var running = e.startAt && e.startAt <= now; var label = running ? 'Jetzt' : esc(dayLabel(e.date)) + (e.time ? ' ' + esc(e.time) : '');
      return '<span class="ev"><b' + (running ? ' class="ev-now"' : e.date === iso(new Date()) ? ' class="ev-today"' : '') + '>' + label + '</b> ' + esc(e.title) + '</span>';
    }).join('');
    if (el.bhHtml !== html) { el.innerHTML = html; el.bhHtml = html; }
  }
  function renderDay() { paintDay(); renderEvents(); }

  function paintDay() {
    var el = document.getElementById('today');
    var days = plan && plan.days ? plan.days.filter(function (d) { return d.date >= iso(new Date()); }) : [];
    var tabs = function (isParty) { return (party ? '<span class="' + (isParty ? 'on' : '') + '">Geburtstag</span>' : '') + days.map(function (d, i) { return '<span class="' + (!isParty && i === dayIndex ? 'on' : '') + '">' + esc(dayLabel(d.date)) + (isParty && i === 0 && notable(d) ? '<i class="tabdot"></i>' : '') + '</span>'; }).join('') + (days.length ? '<em>◀ ▶ ' + (isParty ? 'Stundenplan' : 'Tag wechseln') + '</em>' : ''); };
    if (party && partyView) { paintOnce(el, 'on party', '<div class="day-tabs">' + tabs(true) + '</div>' + partyHtml()); return; }
    if (!days.length) { el.className = ''; el.innerHTML = ''; el.bhHtml = ''; return; }
    dayIndex = Math.min(dayIndex, days.length - 1);
    var day = days[dayIndex]; var kids = day.kids.filter(function (k) { return k.lessons.length; });
    paintOnce(el, 'on', '<div class="day-tabs">' + tabs(false) + '</div><div class="kids">' + (kids.length ? kids.map(function (k) {
      var live = k.lessons.filter(function (l) { return l.state !== 'cancelled'; });
      var time = live.length ? live[0].from + ' – ' + live[live.length - 1].to : 'alles fällt aus';
      var homework = k.homework && k.homework.length ? '<div class="hw">' + k.homework.slice(0, 3).map(function (h) { return '<div><b>' + esc(h.subject) + '</b> ' + esc(h.text) + '</div>'; }).join('') + '</div>' : '';
      return '<div class="kid"><div class="kid-head">' + esc(k.name) + '<span>' + esc(time) + '</span></div><div class="kid-plan">' + merged(k.lessons).map(function (l) {
        var cls = l.state === 'regular' ? (l.exam ? 'exam' : '') : l.state;
        return '<span class="lb ' + cls + '">' + esc(l.subject) + (l.exam ? ' Klausur' : l.state === 'changed' ? ' geändert' : '') + '</span>';
      }).join('') + '</div>' + homework + '</div>';
    }).join('') : '<div class="kid"><div class="kid-head">Schulfrei</div></div>') + '</div>');
  }

  // Redraw only when something changes: otherwise the confetti restarts on every menu update.
  function paintOnce(el, cls, html) { el.className = cls + (tight ? ' tight' : ''); if (el.bhHtml !== html) { el.innerHTML = html; el.bhHtml = html; } }

  function roomNote(r) {
    if (!r.reachable) return { text: 'Nicht erreichbar', cls: 'alarm' };
    if (r.windowOpen) return { text: 'Fenster offen', cls: 'alarm' };
    if (r.batteryLow) return { text: 'Batterie schwach', cls: 'alarm' };
    if (r.heating) return { text: 'Heizt auf ' + deg(r.target), cls: 'heat' };
    return { text: (r.mode === 'manual' ? 'Manuell: ' : 'Soll ') + deg(r.target), cls: '' };
  }
  function paintRoom(tile, r) {
    if (r.name === shownRoom().name) tile.className += ' playing';
    tile.className = tile.className.replace(' editing', '');
    var small = tile.querySelector('small'); var note = roomNote(r);
    var big = tile.querySelector('.t');
    var editing = edit && edit.name === r.name;
    big.innerHTML = editing ? deg(edit.temp) + '<i>▲▼</i>' : deg(r.temp);
    if (editing) { tile.className += ' editing'; small.className = ''; small.textContent = 'Aktuell ' + deg(r.temp); }
    else if (pending && pending.name === r.name) {
      small.className = pending.state === 'fail' ? 'alarm' : pending.state === 'ok' ? 'heat' : '';
      small.textContent = pending.state === 'fail' ? 'Nicht gespeichert' : pending.state === 'ok' ? 'Gespeichert' : 'Wird gesetzt …';
    }
    else { small.className = note.cls; small.textContent = note.text; }
  }
  function paintRoomsHint() {
    var g = grids.rooms; if (!g) return;
    var hint = g.el.querySelector('.g-hint'); if (!hint) return;
    g.el.className = 'grid' + (edit ? ' is-editing' : '');
    hint.innerHTML = edit ? '<kbd>▲▼</kbd> Ändern <kbd>OK</kbd> Speichern ' + (edit.manual ? '<kbd>◀</kbd> Wieder nach Plan ' : '') + (edit.name !== shownRoom().name ? '<kbd>▶</kbd> Startbild ' : '') + '<kbd>Zurück</kbd> Abbrechen' : '<kbd>OK</kbd> Soll und Startbild <kbd>Zurück</kbd> Schließen';
  }
  function finishPending(state, ms) {
    pending.state = state; clearTimeout(setPending.t);
    setPending.t = setTimeout(function () { pending = null; paint(); }, ms);
  }
  function setPending(name) {
    pending = { name: name, state: 'wait' }; clearTimeout(setPending.t);
    setPending.t = setTimeout(function () { finishPending('fail', 4000); paint(); }, 15000);
  }
  function saveEdit(value) { api.onRoomTemp(edit.id, value); setPending(edit.name); edit = null; }

  // Long album list: the focused row stays in view, with one row of context above.
  function scrollAlbums() {
    var g = grids.photos; if (!g) return;
    g.el.children[1].scrollTop = Math.max(0, Math.floor(g.at / COLS.photos) - 1) * ALBUM_ROW;
    var it = g.items[g.at]; var hasAll = !!(g.items[0] && g.items[0].playAll); var total = g.items.length - (hasAll ? 1 : 0); var no = g.at + (hasAll ? 0 : 1);
    g.el.querySelector('h2').innerHTML = 'Fotos' + (it ? '<span class="g-hint">' + (hasAll && !g.at ? total + ' Alben' : 'Album ' + no + ' von ' + total + ' · ' + esc(it.label)) + (yearFilter || searchText ? ' · Zurück: Filter löschen' : '') + '</span>' : '');
  }

  function paint() {
    paintRoomsHint();
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
        if (zone === 'content' && page === name && k === g.at && !(name === 'photos' && photoZone === 'bar')) tiles[k].className += ' focus';
        if (name === 'rooms') paintRoom(tiles[k], g.items[k]);
        if (name === 'radio') {
          var on = g.items[k].id === playingId;
          if (on && audio === 'ok') tiles[k].className += ' playing';
          var sub = g.items[k].sub || '';
          tiles[k].querySelector('small').textContent = !on ? sub : audio === 'fail' ? 'Nicht erreichbar' : (audio === 'ok' ? 'Läuft · ' : audio === 'paused' ? 'Pausiert · ' : 'Verbinde · ') + sub;
        }
      }
    });
    scrollAlbums(); // last: a hidden list cannot scroll
    if (grids.photos) paintPhotoBar();
  }

  var deg = function (v) { return v === null || v === undefined ? '–' : String(v).replace('.', ',') + '°'; };
  function shownRoom() {
    var hit = rooms.filter(function (r) { return r.name === room; })[0];
    return hit || rooms.filter(function (r) { return r.name === 'Wohnzimmer'; })[0] || rooms[0] || {};
  }
  // One room on the start screen; warnings apply to the whole apartment.
  function renderIndoor() {
    var el = document.getElementById('indoor'); var r = shownRoom();
    if (!r.name) { el.innerHTML = ''; return; }
    var open = rooms.filter(function (x) { return x.windowOpen; })[0]; var low = rooms.filter(function (x) { return x.batteryLow; })[0];
    var warn = open ? 'Fenster offen: ' + open.name : low ? 'Batterie schwach: ' + low.name : '';
    var differs = typeof r.temp === 'number' && typeof r.target === 'number' && Math.abs(r.temp - r.target) >= 0.5;
    el.innerHTML = esc(r.name) + ' <b>' + deg(r.temp) + '</b>' + (differs ? ' (Soll ' + deg(r.target) + ')' : '') + (r.heating ? ' · heizt' : '') + (warn ? '<span class="warn">' + esc(warn) + '</span>' : '');
  }
  function renderRooms(list, heat) {
    var sig = JSON.stringify([list, heat]);
    if (sig === roomsSig) return;
    roomsSig = sig; heating = heat || null; if (pending && pending.state === 'wait') finishPending('ok', 3000);
    rooms = list.slice().sort(function (a, b) { return (b.name === 'Wohnzimmer') - (a.name === 'Wohnzimmer'); });
    var at = grids.rooms ? grids.rooms.at : 0;
    var state = heating && (heating.mode || heating.plan) ? '<span class="g-plan">' + esc(heating.mode || 'Plan: ' + heating.plan) + '</span>' : '';
    buildGrid('rooms', 'Räume' + state + '<span class="g-hint"></span>', rooms, function (r) {
      return '<div class="tile room"><b>' + esc(r.name) + '</b><span class="t">' + deg(r.temp) + '</span><small></small></div>';
    });
    grids.rooms.at = Math.min(at, Math.max(list.length - 1, 0));
    renderIndoor(); paint();
  }

  // Fotos: year filter and search above the album list. The filter works locally, the Beamer already has all albums.
  var allAlbums = []; var yearFilter = null; var searchText = ''; var photoZone = 'grid'; var barAt = 1; var barItems = [];
  var barEl = document.createElement('div'); barEl.id = 'photo-bar';
  var chipsEl = document.createElement('div'); chipsEl.id = 'photo-chips'; barEl.appendChild(chipsEl);
  var searchBefore = '';
  var searchEl = document.createElement('input'); searchEl.id = 'photo-search'; searchEl.type = 'text'; searchEl.placeholder = 'Album suchen …'; searchEl.setAttribute('autocomplete', 'off'); barEl.appendChild(searchEl);
  var plain = function (s) { return String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u'); };
  var fold = function (s) { return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'); };
  function buildPhotoBar() {
    var years = []; allAlbums.forEach(function (a) { if (a.year && years.indexOf(a.year) < 0) years.push(a.year); });
    years.sort().reverse();
    barItems = [{ kind: 'search' }, { kind: 'all' }].concat(years.map(function (y) { return { kind: 'year', year: y }; }));
  }
  function filteredAlbums() {
    var words = fold(searchText).split(/\s+/).filter(Boolean);
    return allAlbums.filter(function (a) {
      if (yearFilter && a.year !== yearFilter) return false;
      var raw = a.label + ' ' + (a.when || ''); var text = fold(raw) + ' ' + plain(raw); // umlauts are awkward on a TV keyboard
      return words.every(function (w) { return text.indexOf(w) >= 0; });
    });
  }
  function renderAlbums() {
    var list = filteredAlbums();
    var first = yearFilter ? { id: 'y' + yearFilter, label: 'Alle aus ' + yearFilter, when: 'Zufällig gemischt', playAll: true } : ALL_ALBUMS;
    var items = list.length && !searchText ? [first].concat(list) : list;
    buildGrid('photos', 'Fotos', items, function (x) { return '<div class="tile album' + (x.playAll ? ' all' : '') + '"><b>' + esc(x.label) + '</b><small>' + esc(x.when || '') + '</small></div>'; });
    if (!items.length) grids.photos.el.children[1].innerHTML = '<p class="g-empty">' + (allAlbums.length ? 'Keine Alben' + (searchText ? ' für „' + esc(searchText) + '“' : '') + '. Zurück löscht den Filter.' : 'Noch keine Alben verfügbar.') + '</p>';
    if (barEl.parentNode !== grids.photos.el) grids.photos.el.appendChild(barEl); // moving it would close the keyboard
    paintPhotoBar();
  }
  function paintPhotoBar() {
    chipsEl.innerHTML = barItems.map(function (b, i) {
      var active = b.kind === 'all' ? !yearFilter : b.kind === 'year' ? yearFilter === b.year: !!searchText;
      var text = b.kind === 'search' ? (searchText ? 'Suche: ' + esc(searchText) : 'Suche') : b.kind === 'all' ? 'Alle Jahre' : b.year;
      var focused = zone === 'content' && page === 'photos' && photoZone === 'bar' && i === barAt;
      return '<span class="chip' + (active ? ' on' : '') + (focused ? ' focus' : '') + '">' + text + '</span>';
    }).join('');
    var chip = chipsEl.children[barAt];
    if (chip) chipsEl.scrollLeft = Math.max(0, chip.offsetLeft - 400);
    chipsEl.className = (chipsEl.scrollLeft > 0 ? 'more-l ' : '') + (chipsEl.scrollLeft + chipsEl.clientWidth < chipsEl.scrollWidth - 1 ? 'more-r' : '');
  }
  function closeSearch() { searchEl.className = ''; chipsEl.style.visibility = ''; searchEl.blur(); paint(); }
  function openSearch() { searchBefore = searchText; searchEl.value = searchText; searchEl.className = 'open'; chipsEl.style.visibility = 'hidden'; searchEl.focus(); }
  searchEl.addEventListener('input', function () { searchText = searchEl.value.trim(); renderAlbums(); scrollAlbums(); });
  // The keyboard can also close without a key event.
  searchEl.addEventListener('blur', function () { if (searchEl.className) closeSearch(); });
  function cancelSearch() { searchText = searchBefore; renderAlbums(); closeSearch(); }
  searchEl.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.keyCode === 13 || e.keyCode === 65376) { e.preventDefault(); photoZone = grids.photos.items.length ? 'grid' : 'bar'; closeSearch(); }
    else if (e.keyCode === 10009 || e.keyCode === 8 && !searchEl.value || e.keyCode === 65385) { e.preventDefault(); cancelSearch(); }
  });
  function moveBar(k) {
    if (k === 37) { if (barAt > 0) barAt--; else { setZone('side'); return; } }
    else if (k === 39) { if (barAt < barItems.length - 1) barAt++; }
    else if (k === 40 && grids.photos.items.length) photoZone = 'grid';
    paint();
  }
  function applyBar() {
    var b = barItems[barAt]; if (!b) return;
    if (b.kind === 'search') { openSearch(); return; }
    yearFilter = b.kind === 'year' ? b.year : null; // focus stays here, so years can be compared quickly
    renderAlbums(); paint();
  }

  function buildGrid(name, title, items, tile) {
    var el = document.getElementById('grid-' + name);
    var html = items.map(tile).join('');
    // The album list keeps its elements: the search field lives next to them and must not lose focus.
    if (name === 'photos' && el.children[1]) el.children[1].innerHTML = html;
    else el.innerHTML = '<h2>' + title + '</h2><div>' + html + '</div>';
    grids[name] = { items: items, el: el, at: 0 };
  }

  var CAKE = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM4 16c2 2 4 2 6 0s4-2 6 0 4 2 4 0M12 11V7M12 3v.5"/></svg>';
  function renderBirthdays(list, facts) {
    var el = document.getElementById('bday');
    var kids = list.filter(function (b) { return b.inDays === 0; });
    var had = !!party;
    party = kids.length ? { kids: kids, facts: facts || { facts: [], born: null } } : null;
    if (party && !had) partyView = true;
    var soon = party ? [] : list.slice(0, 2);
    el.className = soon.length ? 'on' : '';
    el.innerHTML = soon.map(function (b) {
      return '<div class="bd">' + CAKE + '<small>' + (b.inDays === 1 ? 'Morgen' : 'In ' + b.inDays + ' Tagen') + ' wird</small>' + esc(b.name) + ' ' + b.age + '</div>';
    }).join('');
    renderDay();
  }
  function partyHtml() {
    var colors = ['#ffffff', '#1e40af', '#be185d', '#fef3c7']; var conf = ''; var cfX = [480, 600, 455, 560, 470, 612, 525, 450, 585, 505, 465, 595];
    for (var i = 0; i < 12; i++) conf += '<i class="cf" style="left:' + cfX[i] + 'px;background:' + colors[i % 4] + ';animation-delay:-' + (i * .75).toFixed(2) + 's"></i>';
    var plain = party.kids.map(function (b) { return b.name; }).join(' und ');
    var ages = party.kids.map(function (b) { return b.age; }).join(' und ');
    var f = party.facts.facts.map(function (x) { return '<div class="fact"><b>' + x.year + '</b><span>' + esc(x.text) + '</span></div>'; }).join('');
    var born = party.facts.born ? '<div class="fact born"><b>' + party.facts.born.year + '</b><span>Auch Geburtstag: ' + esc(party.facts.born.text) + '</span></div>' : '';
    return '<div class="p-wrap"><div class="p-hero"><div class="confetti" aria-hidden="true">' + conf + '</div><small>Alles Gute zum Geburtstag</small><strong' + (plain.length > 7 ? ' class="long"' : '') + '>' + esc(plain) + '</strong><span>' + (party.kids.length > 1 ? 'werden' : 'wird') + ' heute ' + ages + '</span></div>' +
      (f || born ? '<div class="p-facts"><h2>An diesem Tag</h2>' + f + born + '</div>' : '') + '</div>';
  }

  function setMenu(menu) {
    if (!menu) return;
    plan = menu.schedule || null; events = menu.events || []; renderDay();
    var alertsEl = document.getElementById('alerts'); var alerts = menu.alerts || []; tight = alerts.length > 1;
    alertsEl.className = alerts.length ? 'on' : '';
    alertsEl.innerHTML = alerts.slice(0, 2).map(function (a) { return '<div class="alert"><svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2zM12 10v5M12 18h.01"/></svg><b>' + esc(a.label) + '</b><span>' + esc(a.text) + '</span></div>'; }).join('');
    board = menu.board || null; renderBoard();
    renderBirthdays(menu.birthdays || [], menu.onThisDay);
    renderRooms(menu.rooms || [], menu.heating);
    var albums = menu.photoAlbums || []; var next = JSON.stringify([menu.radio, menu.mood, albums]);
    if (next === signature) return;
    signature = next;
    buildGrid('radio', 'Radio', menu.radio || [], function (x) { return '<div class="tile station">' + esc(x.name) + '<small>' + esc(x.sub || '') + '</small></div>'; });
    allAlbums = albums; buildPhotoBar(); renderAlbums();
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
    if (page === 'rooms' && edit) {
      if (dy) edit.temp = Math.min(30, Math.max(7, edit.temp - dy * 0.5));
      else if (dx > 0) { room = edit.name; try { localStorage.setItem('bh-room', room); } catch (e) { /* then applies until the next restart */ } edit = null; renderIndoor(); }
      else if (dx < 0 && edit.manual) saveEdit('p');
      paint(); return;
    }
    var g = grids[page]; if (!g) return;
    if (page === 'photos' && dy < 0 && g.at < COLS.photos) { photoZone = 'bar'; paint(); return; }
    var cols = COLS[page]; var col = g.at % cols;
    if (dx < 0 && col === 0) { setZone('side'); return; }
    if (dx > 0 && col === cols - 1) return;
    var to = g.at + dx + dy * cols;
    if (dy < 0 && to < 0) to = col;
    if (dy > 0 && to >= g.items.length && Math.floor(g.at / cols) < Math.floor((g.items.length - 1) / cols)) to = g.items.length - 1;
    if (to < 0 || to >= g.items.length) return;
    g.at = to; paint();
  }
  function moveStart(key) {
    var count = plan && plan.days ? plan.days.length : 0;
    var onParty = party && partyView;
    if (key === 37) { if (!onParty && dayIndex > 0) { dayIndex--; renderDay(); } else if (!onParty && party) { partyView = true; renderDay(); } else { setZone('side'); } }
    else if (key === 39) { if (onParty) { partyView = false; dayIndex = 0; renderDay(); } else if (dayIndex < count - 1) { dayIndex++; renderDay(); } }
    else if (api.isRadioOn()) { var st = step(key === 40 ? 1 : -1); if (st) tuneSoon(st); }
  }
  // The menu closes by itself when nothing is pressed any more.
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
    if (i >= 0 && i < PAGES.length) { page = PAGES[i]; photoZone = 'grid'; if (page === 'rooms' && grids.rooms) grids.rooms.at = Math.max(rooms.indexOf(shownRoom()), 0); paint(); }
  }
  function enter() {
    if (zone === 'side') { setZone('content'); return; }
    if (page === 'photos' && photoZone === 'bar') { applyBar(); return; }
    if (page === 'start') { if (api.onPause) api.onPause(); return; }
    clearTimeout(tuneTimer); tuneTimer = null;
    var g = grids[page]; if (!g) return;
    if (page === 'rooms') {
      var chosen = g.items[g.at]; if (!chosen) return;
      if (edit) { if (edit.temp !== edit.from) saveEdit(edit.temp); else edit = null; paint(); return; }
      edit = { id: chosen.id, name: chosen.name, temp: typeof chosen.target === 'number' ? chosen.target : 20, from: chosen.target, manual: chosen.mode === 'manual' };
      paint(); return;
    }
    if (page === 'radio') api.onTune(g.items[g.at]); else if (page === 'photos') { if (g.items[g.at]) api.onPhotos(g.items[g.at]); } else api.onMood(g.items[g.at]);
  }

  document.addEventListener('keydown', function (e) {
    if (document.body.className.indexOf('home') < 0) return;
    var k = e.keyCode;
    if (k === 13) enter();
    else if (k < 37 || k > 40) return;
    else if (zone === 'side') moveSide(k);
    else if (page === 'photos' && photoZone === 'bar') moveBar(k);
    else if (page === 'start') moveStart(k);
    else { var fast = page === 'photos' && e.repeat ? 3 : 1; moveGrid(k === 37 ? -1 : k === 39 ? 1 : 0, (k === 38 ? -1 : k === 40 ? 1 : 0) * fast); }
    e.preventDefault();
  });

  // Back: first back to the start content, after that main.js decides.
  api.back = function () {
    clearTimeout(tuneTimer); tuneTimer = null;
    if (searchEl.className) { cancelSearch(); return true; }
    if (edit) { edit = null; paint(); return true; }
    if (page === 'photos' && zone === 'content' && (yearFilter || searchText)) { yearFilter = null; searchText = ''; barAt = 1; photoZone = 'grid'; renderAlbums(); paint(); return true; }
    if (page === 'photos' && zone === 'content' && photoZone === 'bar') { photoZone = 'grid'; paint(); return true; }
    if (zone === 'side') { setZone('content'); return true; }
    if (page !== 'start') { page = 'start'; dayIndex = 0; renderDay(); paint(); return true; }
    if (dayIndex) { dayIndex = 0; renderDay(); return true; }
    if (party && !partyView) { partyView = true; renderDay(); return true; }
    return false;
  };
  // Shows the installed version: from the system, otherwise from the package itself.
  (function showVersion() {
    var el = document.getElementById('side-ver');
    var put = function (v) { if (v) el.textContent = 'BH Home ' + v; };
    try { put(tizen.application.getAppInfo().version); return; } catch (e) { /* continue with config.xml */ }
    try {
      var x = new XMLHttpRequest(); x.open('GET', 'config.xml');
      x.onload = function () { var m = /<widget[^>]*\sversion="([^"]+)"/.exec(x.responseText); if (m) put(m[1]); };
      x.send();
    } catch (e) { /* continue without display */ }
  })();
  tick(); setInterval(tick, 5000);
  weather(); setInterval(weather, 900000);
  setInterval(renderBoard, 20000);
  // Channel rocker: step through stations while the radio plays, otherwise start the first one.
  api.channel = function (dir) { var st = step(dir); if (!st) return; if (api.isRadioOn()) tuneSoon(st); else api.onTune(st); };
  api.currentId = function () { return playingId; };
  api.step = step; api.setState = function (s) { audio = s; paint(); };
  api.setMenu = setMenu; api.setPlaying = setPlaying;
  paint();
  return api;
})();
