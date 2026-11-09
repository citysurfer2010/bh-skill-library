// Photo slideshow: asks for one picture at a time, loads it invisibly and cross-fades. Deliberately old JavaScript for Tizen 5.5.
window.BHPhotos = (function () {
  'use strict';
  var DWELL_MS = 15000; var RETRY_MS = 8000; var MAX_FAILS = 2; var END_MS = 5000; var RESUME_MS = 3000; var START_DELAY_MS = 600; var CAP_MS = 8000; var NOTE_MS = 3000; var FIRST_HELP_MS = 8000;
  var HELP = 'OK Pause  ·  ▶ Nächstes Foto  ·  Zurück Beenden';
  var PAUSED = 'Pausiert  ·  OK Weiter  ·  ▶ Nächstes Foto  ·  Zurück Beenden';
  var imgs = document.querySelectorAll('#photos .ph');
  var capEl = document.getElementById('ph-cap'); var noteEl = document.getElementById('ph-note'); var msgEl = document.getElementById('ph-msg');
  var run = 0; var front = 0; var lastId = ''; var shownAt = 0; var ready = null; var paused = false; var over = false; var skipWanted = false; var sticky = false; var fails = 0;
  var timer = null; var retryTimer = null; var noteTimer = null; var capTimer = null;
  var send = null; var finish = null;

  function msg(text) { msgEl.textContent = text; }
  function hideNote() { noteEl.className = ''; sticky = false; }
  function note(text, keep, ms) {
    noteEl.textContent = text; noteEl.className = 'on'; sticky = !!keep; clearTimeout(noteTimer);
    if (!keep) noteTimer = setTimeout(function () { if (paused) note(PAUSED, true); else hideNote(); }, ms || NOTE_MS);
  }
  function fadeCaptionLater() { clearTimeout(capTimer); capTimer = setTimeout(function () { if (!paused) capEl.className = ''; }, CAP_MS); }
  function caption(text) { capEl.textContent = text; capEl.className = text ? 'on' : ''; if (text) fadeCaptionLater(); else clearTimeout(capTimer); }

  function trouble(mine) {
    fails++;
    if (fails >= MAX_FAILS && !shownAt) msg('Die Fotos sind gerade nicht erreichbar. Zurück beendet die Anzeige.');
    else if (fails >= MAX_FAILS) note('Nächstes Foto kommt gerade nicht. Neuer Versuch läuft.', true);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { if (mine === run) ask('next'); }, RETRY_MS);
  }
  function ended(empty) {
    over = true; hideNote();
    msg(empty ? 'In diesem Album gibt es keine passenden Fotos.' : 'Album zu Ende');
    imgs[front].className = 'ph'; caption('');
    var mine = run;
    timer = setTimeout(function () { if (mine === run) { stop(); finish(); } }, END_MS);
  }
  function swap() {
    var photo = ready; ready = null;
    if (photo.done) { ended(photo.empty); return; }
    var first = !shownAt;
    imgs[front].className = 'ph'; front = 1 - front; imgs[front].className = 'ph on';
    caption(photo.caption); msg(''); shownAt = Date.now(); fails = 0;
    if (first) note(HELP, false, FIRST_HELP_MS); else if (paused) note(PAUSED, true); else if (sticky) hideNote();
    ask('next');
  }
  function showWhenDue() {
    if (ready && skipWanted) { skipWanted = false; clearTimeout(timer); swap(); return; }
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
      // The end of an album waits its turn, so the last picture keeps its full time.
      if (p.done) { ready = p; showWhenDue(); } else load(mine, p);
    };
    x.onerror = x.ontimeout = function () { if (mine === run) trouble(mine); };
    x.send();
  }
  // At the start the request needs a moment to clear the previous show before the first wait.
  function ask(what, delay) { var mine = run; send('photos', what); if (delay) timer = setTimeout(function () { if (mine === run) wait(mine); }, delay); else wait(mine); }

  function stop() {
    run++; clearTimeout(timer); clearTimeout(retryTimer); clearTimeout(noteTimer); ready = null; paused = false; over = false; skipWanted = false;
    imgs[0].removeAttribute('src'); imgs[1].removeAttribute('src'); imgs[0].className = 'ph'; imgs[1].className = 'ph';
    caption(''); hideNote(); msg('');
  }
  function start(id, sendRequest, onEnd) {
    stop(); send = sendRequest; finish = onEnd; lastId = ''; shownAt = 0; fails = 0; front = 0;
    msg('Fotos werden geladen …');
    ask(id, START_DELAY_MS);
  }
  function togglePause() {
    if (!shownAt || over) return;
    paused = !paused; clearTimeout(timer);
    if (paused) { note(PAUSED, true); clearTimeout(capTimer); capEl.className = capEl.textContent ? 'on' : ''; return; }
    note('Weiter'); fadeCaptionLater(); shownAt = Date.now() - DWELL_MS + RESUME_MS; showWhenDue();
  }
  function skip() {
    if (!shownAt || over) return;
    if (ready) { clearTimeout(timer); skipWanted = false; swap(); return; }
    skipWanted = true; note('Nächstes Foto wird geladen …', true);
  }

  return { start: start, stop: stop, togglePause: togglePause, skip: skip, note: note, help: function () { note(HELP); } };
})();
