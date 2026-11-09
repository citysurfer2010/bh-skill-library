// Central search: filters tiles live, "/" focuses, Enter opens the best match, Esc clears.
(function () {
  'use strict';
  var input = document.getElementById('appSearch');
  if (!input) return;
  var S = window.BHModuleSearch;
  var data = JSON.parse(document.getElementById('dashData').textContent);
  var clearBtn = document.getElementById('appSearchClear');
  var kbd = document.getElementById('appSearchKbd');
  var host = document.getElementById('appSearchResults');
  var empty = document.getElementById('searchEmpty');
  var emptyQuery = document.getElementById('searchEmptyQuery');
  var ranked = null;

  function matches(text, q) { return S.fold(text).indexOf(S.fold(q)) >= 0 || S.foldTranslit(text).indexOf(S.foldTranslit(q)) >= 0; }

  function filterTiles() {
    var q = input.value.trim();
    clearBtn.hidden = !q;
    kbd.hidden = !!q;
    var hits = 0;
    document.querySelectorAll('.app-tile').forEach(function (t) {
      var hit = !q || matches(t.querySelector('.tile-label').textContent + ' ' + t.querySelector('.tile-desc').textContent, q);
      t.classList.toggle('search-hidden', !hit);
      if (hit) hits++;
    });
    document.querySelectorAll('.app-section').forEach(function (s) {
      s.classList.toggle('search-hidden', !!q && !s.querySelector('.app-tile:not(.search-hidden)'));
    });
    empty.hidden = !(q && hits === 0);
    emptyQuery.textContent = q;
  }

  function items() { return host.querySelectorAll('.app-search-result'); }
  function activeIndex() { return Array.prototype.findIndex.call(items(), function (x) { return x.classList.contains('is-active'); }); }
  function setActive(i) {
    items().forEach(function (x, k) { x.classList.toggle('is-active', k === i); x.setAttribute('aria-selected', String(k === i)); });
    var el = items()[i];
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  function renderResults() {
    ranked = S.rank(data.modules, data.apps, input.value, 6);
    host.innerHTML = S.html(ranked);
    host.hidden = !ranked.modules.length;
    input.setAttribute('aria-expanded', String(!host.hidden));
    setActive(activeIndex());
  }
  function update() { filterTiles(); renderResults(); }
  function open(url) { if (url.charAt(0) === '/') location.href = url; else window.open(url, '_blank', 'noopener'); }
  function chosenUrl() {
    var i = activeIndex();
    if (i >= 0) return items()[i].getAttribute('href');
    if (ranked && ranked.top) return ranked.top.url;
    var first = document.querySelector('.app-tile:not(.search-hidden)');
    return first ? first.getAttribute('href') : null;
  }
  function move(delta) { var n = items().length; if (!n) return false; setActive((activeIndex() + delta + n) % n); return true; }

  input.addEventListener('input', update);
  input.addEventListener('focus', function () { if (host.innerHTML) host.hidden = false; });
  clearBtn.addEventListener('click', function () { input.value = ''; update(); input.focus(); });
  document.addEventListener('click', function (e) { if (!host.contains(e.target) && e.target !== input) host.hidden = true; });
  input.addEventListener('keydown', function (e) {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && move(e.key === 'ArrowDown' ? 1 : -1)) { e.preventDefault(); return; }
    if (e.key === 'Enter' && input.value.trim()) { var u = chosenUrl(); if (u) open(u); }
    if (e.key === 'Escape') { input.value = ''; update(); input.blur(); }
  });
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); input.focus(); }
  });
  // Not on touch devices, otherwise the keyboard immediately covers the tiles.
  if (!window.matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });
})();
