// Expands forms inside the row and clears notices from the address.
(function () {
  'use strict';
  function show(panel, btn, open) {
    panel.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) { var field = panel.querySelector('input, [data-cancel]'); if (field) field.focus(); } else if (btn) btn.focus();
  }
  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    var panel = document.getElementById(btn.dataset.toggle);
    btn.addEventListener('click', function () { show(panel, btn, panel.hidden); });
  });
  document.querySelectorAll('[data-cancel]').forEach(function (btn) {
    var panel = document.getElementById(btn.dataset.cancel);
    btn.addEventListener('click', function () { show(panel, document.querySelector('[data-toggle="' + panel.id + '"]'), false); });
  });
  document.querySelectorAll('[data-reveal]').forEach(function (btn) {
    var field = document.getElementById(btn.dataset.reveal);
    btn.addEventListener('click', function () {
      var shown = field.type === 'password';
      field.type = shown ? 'text' : 'password';
      btn.textContent = shown ? 'Verbergen' : 'Anzeigen';
    });
  });
  var open = document.querySelector('.p-panel:not([hidden]) [aria-invalid="true"]') || document.querySelector('.p-panel:not([hidden]) input');
  if (open) open.focus();
  if (location.search) history.replaceState(null, '', location.pathname);
})();
