// Photo slideshow: asks for one picture at a time, loads it invisibly and cross-fades. Deliberately old JavaScript for Tizen 5.5.
window.BHPhotos = (function () {
  'use strict';
  var DWELL_MS = 15000; var RETRY_MS = 8000; var MAX_FAILS = 4; var END_MS = 5000; var RESUME_MS = 3000; var START_DELAY_MS = 600;
  var imgs = document.querySelectorAll('#photos .ph');
  var capEl = document.getElementById('ph-cap'); var noteEl = document.getElementById('ph-note'); var msgEl = document.getElementById('ph-msg');
  var run = 0; var front = 0; var lastId = ''; var shownAt = 0; var ready = null; var paused = false; var timer = null; var noteTimer = null; var fails = 0;
  var send = null; var finish = null;

  function msg(text) { msgEl.textContent = text; }
  function note(text, keep) {
    noteEl.textContent = text; noteEl.className = 'on'; clearTimeout(noteTimer);
    if (!keep) noteTimer = setTimeout(function () { noteEl.className = ''; }, 3000);
  }
  function caption(text) { capEl.textContent = text; capEl.className = text ? 'on' : ''; }

  function trouble(mine) {
    fails++;
    if (fails >= MAX_FAILS && !shownAt) msg('Die Fotos sind gerade nicht erreichbar.');
    timer = setTimeout(function () { if (mine === run) ask('next'); }, RETRY_MS);
  }
  function ended(empty) {
    msg(empty ? 'In diesem Album gibt es keine passenden Fotos.' : 'Album zu Ende');
    imgs[front].className = 'ph'; caption('');
    var mine = run;
    timer = setTimeout(function () { if (mine === run) { stop(); finish(); } }, END_MS);
  }
  function swap() {
    var photo = ready; ready = null;
    imgs[front].className = 'ph'; front = 1 - front; imgs[front].className = 'ph on';
    caption(photo.caption); msg(''); shownAt = Date.now(); fails = 0;
    ask('next');
  }
  function showWhenDue() {
    if (!ready || paused) return;
    clearTimeout(timer);
    timer = setTimeout(swap, shownAt ? Math.max(0, DWELL_MS - (Date.now() - shownAt)) : 0);
  }
  function load(mine, photo) {
    var img = imgs[1 - front];
    img.onload = function () { if (mine !== run) return; ready = photo; showWhenDue(); };
    img.onerror = function () { if (mine === run) trouble(mine); };
    img.src = window.BH_SCREEN_URL + '/photo/' + photo.id;
  }
  function wait(mine) {
    var x = new XMLHttpRequest();
    x.open('GET', window.BH_SCREEN_URL + '/photo-wait?after=' + encodeURIComponent(lastId) + '&t=' + Date.now());
    x.timeout = 35000;
    x.onload = function () {
      if (mine !== run) return;
      var p = null; try { p = JSON.parse(x.responseText); } catch (e) { /* treated as no answer */ }
      if (x.status !== 200 || !p || !p.id) { trouble(mine); return; }
      lastId = p.id;
      if (p.done) ended(p.empty); else load(mine, p);
    };
    x.onerror = x.ontimeout = function () { if (mine === run) trouble(mine); };
    x.send();
  }
  // At the start the request needs a moment to clear the previous show before the first wait.
  function ask(what, delay) { var mine = run; send('photos', what); if (delay) timer = setTimeout(function () { if (mine === run) wait(mine); }, delay); else wait(mine); }

  function stop() {
    run++; clearTimeout(timer); clearTimeout(noteTimer); ready = null; paused = false;
    imgs[0].removeAttribute('src'); imgs[1].removeAttribute('src'); imgs[0].className = 'ph'; imgs[1].className = 'ph';
    caption(''); noteEl.className = ''; msg('');
  }
  function start(id, sendRequest, onEnd) {
    stop(); send = sendRequest; finish = onEnd; lastId = ''; shownAt = 0; fails = 0; front = 0;
    msg('Fotos werden geladen …');
    ask(id, START_DELAY_MS);
  }
  function togglePause() {
    if (!shownAt) return;
    paused = !paused; clearTimeout(timer);
    if (paused) { note('Pausiert', true); return; }
    note('Weiter'); shownAt = Date.now() - DWELL_MS + RESUME_MS; showWhenDue();
  }
  function skip() { if (ready && !paused) { clearTimeout(timer); swap(); } }

  return { start: start, stop: stop, togglePause: togglePause, skip: skip, note: note };
})();
