// Feedback after sending, and while Apple checks the login the page asks quietly instead of reloading.
(function () {
  document.querySelectorAll('.ip-form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('[data-busy-label]');
      form.setAttribute('aria-busy', 'true');
      if (btn) { setTimeout(function () { btn.disabled = true; }, 0); btn.textContent = btn.getAttribute('data-busy-label'); }
    });
  });
  var busy = document.querySelector('[data-poll]');
  if (!busy) return;
  var started = Date.now(); var SLOW_MS = 60000; var EVERY_MS = 3000;
  function check() {
    fetch(busy.getAttribute('data-poll'), { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
      if (s.step !== 'busy') { location.replace('/profile/icloud-photos/' + (busy.getAttribute('data-after') ? '?after=' + busy.getAttribute('data-after') : '')); return; }
      if (Date.now() - started > SLOW_MS) busy.querySelector('.ip-slow').hidden = false;
      setTimeout(check, EVERY_MS);
    }).catch(function () { setTimeout(check, EVERY_MS); });
  }
  setTimeout(check, EVERY_MS);
})();
