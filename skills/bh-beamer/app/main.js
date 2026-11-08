// Fragt den Server, was gezeigt werden soll. Bewusst altes JavaScript: Der Beamer nutzt Tizen 5.5.
// Modi: text (Titel + Text), url (Webseite im Vollbild, verlaesst diese Seite), audio (Radio/Musik, die App spielt selbst).
(function () {
  'use strict';
  var titleEl = document.getElementById('title');
  var textEl = document.getElementById('text');
  var noteEl = document.getElementById('note');
  var player = document.getElementById('player');
  var shownUrl = null;
  var playingUrl = null;

  function stopAudio() {
    if (!playingUrl) return;
    playingUrl = null;
    try { player.pause(); player.removeAttribute('src'); player.load(); } catch (e) { /* kein Player */ }
    document.body.className = '';
  }

  function playAudio(url) {
    if (url === playingUrl) return;
    playingUrl = url;
    document.body.className = 'audio';
    noteEl.textContent = 'Verbinde …';
    player.src = url;
    var p = player.play();
    if (p && p.catch) p.catch(function () { noteEl.textContent = 'Wiedergabe nicht möglich'; });
  }

  player.addEventListener('playing', function () { noteEl.textContent = 'Läuft'; });
  player.addEventListener('waiting', function () { noteEl.textContent = 'Puffert …'; });
  player.addEventListener('error', function () { noteEl.textContent = 'Stream nicht erreichbar'; });

  function render(c) {
    if (c.mode === 'url' && c.url && c.url !== shownUrl) {
      stopAudio();
      shownUrl = c.url;
      window.location.replace(c.url);
      return;
    }
    if (c.mode === 'audio' && c.url) playAudio(c.url); else stopAudio();
    titleEl.textContent = c.title || '';
    textEl.textContent = c.text || '';
  }

  function poll() {
    var x = new XMLHttpRequest();
    x.open('GET', window.BH_SCREEN_URL + '/content?t=' + Date.now());
    x.onload = function () {
      if (x.status !== 200) { textEl.textContent = 'Server antwortet nicht (' + x.status + ')'; return; }
      try { render(JSON.parse(x.responseText)); } catch (e) { textEl.textContent = 'Antwort unlesbar'; }
    };
    x.onerror = function () { textEl.textContent = 'Keine Verbindung zum Server'; };
    x.send();
  }

  poll();
  setInterval(poll, 3000);
})();
