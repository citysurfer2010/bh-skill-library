// Benutzermenue oben rechts: oeffnen, schliessen, Design waehlen.
(function () {
  'use strict';
  var host = document.querySelector('.bh-um');
  if (!host) return;
  var btn = host.querySelector('.bh-um-btn');
  var pop = host.querySelector('.bh-um-pop');
  function set(open) { pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
  btn.addEventListener('click', function () { set(pop.hidden); });
  document.addEventListener('mousedown', function (e) { if (!host.contains(e.target)) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { set(false); btn.focus(); } });

  var choices = host.querySelectorAll('[data-um-theme]');
  function mark() {
    var cur = document.documentElement.dataset.theme;
    choices.forEach(function (c) { c.classList.toggle('is-active', c.dataset.umTheme === cur); });
  }
  choices.forEach(function (c) {
    c.addEventListener('click', function () {
      document.documentElement.dataset.theme = c.dataset.umTheme;
      try { localStorage.setItem('bh-theme', c.dataset.umTheme); } catch (e) { /* privater Modus */ }
      mark();
    });
  });
  mark();
})();
