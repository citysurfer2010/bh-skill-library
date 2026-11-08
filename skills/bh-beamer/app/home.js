// Startbild des Beamers: Uhr, Wetter und Menue fuer die Fernbedienung. Bewusst altes JavaScript fuer Tizen 5.5.
window.BHHome = (function () {
  'use strict';
  var LAT = 52.52; var LON = 13.41; var PLACE = 'Berlin';
  var DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var menuEl = document.getElementById('menu');
  var rows = []; var r = 0; var c = 0; var signature = ''; var playingId = null; var tuneTimer = null; var audio = 'load';
  var api = { onTune: function () {}, onMood: function () {}, isRadioOn: function () { return false; } };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); };

  function tick() {
    var d = new Date();
    document.getElementById('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    document.getElementById('date').textContent = DAYS[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()];
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

  function weather() {
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=temperature_2m,weather_code&timezone=Europe%2FBerlin');
    x.onload = function () {
      try {
        var now = JSON.parse(x.responseText).current;
        document.getElementById('temp').textContent = Math.round(now.temperature_2m) + '°';
        document.getElementById('sky').textContent = sky(now.weather_code) + ' · ' + PLACE;
      } catch (e) { /* naechster Versuch */ }
    };
    x.send();
  }

  function paint() {
    rows.forEach(function (row, i) {
      var tiles = row.el.querySelectorAll('.tile');
      for (var k = 0; k < tiles.length; k++) {
        tiles[k].className = tiles[k].className.replace(/ (focus|playing)/g, '');
        if (i === r && k === c) tiles[k].className += ' focus';
        if (row.kind === 'radio') {
          var on = row.items[k].id === playingId;
          if (on && audio === 'ok') tiles[k].className += ' playing';
          var sub = row.items[k].sub || '';
          tiles[k].querySelector('small').textContent = !on ? sub : audio === 'fail' ? 'Nicht erreichbar' : (audio === 'ok' ? 'Läuft · ' : 'Verbinde · ') + sub;
        }
      }
      var first = tiles[0];
      if (first) {
        var w = first.offsetWidth + 22; var shift = i === r ? (row.shift = Math.max(0, c - 3)) : (row.shift || 0);
        row.el.querySelector('.track').style.transform = 'translateX(' + (-shift * w) + 'px)';
      }
    });
  }

  function setMenu(menu) {
    var next = JSON.stringify(menu || {});
    if (!menu || next === signature) return;
    signature = next; rows = [];
    menuEl.innerHTML = '';
    [['radio', 'Radio', menu.radio], ['mood', 'Stimmung', menu.mood]].forEach(function (d) {
      if (!d[2] || !d[2].length) return;
      var el = document.createElement('div'); el.className = 'row';
      el.innerHTML = '<h2>' + d[1] + '</h2><div class="track">' + d[2].map(function (x) {
        return d[0] === 'radio' ? '<div class="tile station">' + esc(x.name) + '<small>' + esc(x.sub || '') + '</small></div>'
          : '<div class="tile mood"><img src="' + esc(x.thumb) + '" alt=""><span>' + esc(x.label) + '</span></div>';
      }).join('') + '</div>';
      menuEl.appendChild(el);
      rows.push({ kind: d[0], items: d[2], el: el });
    });
    r = Math.min(r, Math.max(0, rows.length - 1)); c = 0;
    paint();
  }

  function setPlaying(id) {
    playingId = id;
    if (id && !tuneTimer && rows[0] && rows[0].kind === 'radio') {
      for (var i = 0; i < rows[0].items.length; i++) if (rows[0].items[i].id === id && r === 0) c = i;
    }
    paint();
  }

  function choose() {
    clearTimeout(tuneTimer); tuneTimer = null;
    var row = rows[r]; if (!row) return;
    if (row.kind === 'radio') api.onTune(row.items[c]); else api.onMood(row.items[c]);
  }

  // Laeuft das Radio, wechseln Links und Rechts direkt den Sender (kurz verzoegert, damit man durchblaettern kann).
  function move(dr, dc) {
    if (!rows.length) return;
    var slot = c - (rows[r].shift || 0);
    r = Math.max(0, Math.min(rows.length - 1, r + dr));
    var from = dr ? Math.min(rows[r].items.length - 1, (rows[r].shift || 0) + slot) : c;
    if (dr && rows[r].kind === 'radio' && api.isRadioOn()) {
      for (var j = 0; j < rows[r].items.length; j++) if (rows[r].items[j].id === playingId) from = j;
    }
    // Beim Radio immer vom laufenden Sender aus weiterblaettern.
    if (dc && rows[r].kind === 'radio' && api.isRadioOn() && !tuneTimer) {
      for (var i = 0; i < rows[r].items.length; i++) if (rows[r].items[i].id === playingId) from = i;
    }
    c = Math.max(0, Math.min(rows[r].items.length - 1, from + dc));
    paint();
    if (dc && rows[r].kind === 'radio' && api.isRadioOn()) {
      clearTimeout(tuneTimer);
      var target = rows[r].items[c];
      tuneTimer = setTimeout(function () { tuneTimer = null; if (api.isRadioOn()) api.onTune(target); }, 500);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (document.body.className.indexOf('home') < 0) return;
    if (e.keyCode === 37) move(0, -1); else if (e.keyCode === 39) move(0, 1);
    else if (e.keyCode === 38) move(-1, 0); else if (e.keyCode === 40) move(1, 0);
    else if (e.keyCode === 13) choose(); else return;
    e.preventDefault();
  });

  tick(); setInterval(tick, 5000);
  weather(); setInterval(weather, 900000);
  // Naechster Sender vom laufenden aus, ohne Menue (beim Video).
  api.step = function (dir) {
    var row = rows[0]; if (!row || row.kind !== 'radio') return null;
    var at = -1;
    for (var i = 0; i < row.items.length; i++) if (row.items[i].id === playingId) at = i;
    var next = at < 0 ? 0 : (at + dir + row.items.length) % row.items.length;
    playingId = row.items[next].id; r = 0; c = next; paint();
    return row.items[next];
  };
  api.setState = function (state) { audio = state; paint(); };
  api.setMenu = setMenu; api.setPlaying = setPlaying;
  return api;
})();
