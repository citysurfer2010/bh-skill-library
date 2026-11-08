// Fragt den Server, was gezeigt werden soll. Bewusst altes JavaScript: Der Beamer nutzt Tizen 5.5.
(function () {
  'use strict';
  var titleEl = document.getElementById('title');
  var textEl = document.getElementById('text');
  var shownUrl = null;

  function render(c) {
    if (c.mode === 'url' && c.url && c.url !== shownUrl) {
      shownUrl = c.url;
      window.location.replace(c.url);
      return;
    }
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
