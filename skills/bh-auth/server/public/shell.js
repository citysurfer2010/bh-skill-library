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
  var toggle = document.querySelector('[data-bhs-theme]');
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('bh-theme', theme); } catch (e) { /* privater Modus */ }
    mark();
  }
  if (toggle) toggle.addEventListener('click', function () { apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); });
  function mark() {
    var cur = document.documentElement.dataset.theme;
    choices.forEach(function (c) { c.classList.toggle('is-active', c.dataset.umTheme === cur); });
  }
  choices.forEach(function (c) {
    c.addEventListener('click', function () {
      apply(c.dataset.umTheme);
    });
  });
  mark();
})();
