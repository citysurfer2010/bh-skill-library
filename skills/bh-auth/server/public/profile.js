// Klappt Formulare in der Zeile auf und raeumt Hinweise aus der Adresse.
(function () {
  'use strict';
  function show(panel, btn, open) {
    panel.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) { var field = panel.querySelector('input'); if (field) field.focus(); } else if (btn) btn.focus();
  }
  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    var panel = document.getElementById(btn.dataset.toggle);
    btn.addEventListener('click', function () { show(panel, btn, panel.hidden); });
  });
  document.querySelectorAll('[data-cancel]').forEach(function (btn) {
    var panel = document.getElementById(btn.dataset.cancel);
    btn.addEventListener('click', function () { show(panel, document.querySelector('[data-toggle="' + panel.id + '"]'), false); });
  });
  var open = document.querySelector('.p-panel:not([hidden]) input');
  if (open) open.focus();
  if (location.search) history.replaceState(null, '', location.pathname);
})();
